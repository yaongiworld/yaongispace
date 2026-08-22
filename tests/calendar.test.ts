import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPerson, migrate } from "./db";
import { reset, twoPeople } from "./world";

/**
 * The calendar, against the real database (ticket 07).
 *
 * The behaviour worth asserting here is all in the *readings* of the event
 * table that migration 005 adds, and none of it is visible to a mock: a yearly
 * repeat projected onto a window it was never stored in, a Journey adopting
 * Events purely by date range, and RLS applying to a function the same way it
 * applies to a select.
 *
 * Nothing here tests a month grid, because there is no month grid and there
 * must not be one — see the ticket. The agenda is a window over
 * `event_occurrences`, which is what these tests exercise.
 */

let db: Client;
let towee: string;
let yangcho: string;

beforeAll(async () => {
  db = await migrate();
});

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await reset(db);
  ({ towee, yangcho } = await twoPeople(db));
});

/** Insert an Event and hand back its id. */
async function anEvent(fields: {
  title: string;
  occurredAt: string;
  endsAt?: string;
  allDay?: boolean;
  repeatsYearly?: boolean;
  personId?: string;
  description?: string;
}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO event (title, description, occurred_at, ends_at, all_day, repeats_yearly, person_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      fields.title,
      fields.description ?? null,
      fields.occurredAt,
      fields.endsAt ?? null,
      fields.allDay ?? false,
      fields.repeatsYearly ?? false,
      fields.personId ?? towee,
    ],
  );
  return rows[0].id;
}

/** The agenda over a window, oldest first — the order it scrolls in. */
async function occurrences(from: string, to: string) {
  const { rows } = await db.query(
    `SELECT title, occurs_at, occurred_at, ends_at, is_repeat, repeats_yearly, all_day, person_id
       FROM event_occurrences($1, $2) ORDER BY occurs_at`,
    [from, to],
  );
  return rows as Array<{
    title: string;
    occurs_at: Date;
    occurred_at: Date;
    ends_at: Date | null;
    is_repeat: boolean;
    repeats_yearly: boolean;
    all_day: boolean;
    person_id: string;
  }>;
}

describe("an Event emits an Entry", () => {
  test("with occurred_at set to when the Event happens", async () => {
    const id = await anEvent({
      title: "결혼기념일",
      description: "매년 이맘때",
      occurredAt: "2026-11-11T00:00:00+09:00",
      allDay: true,
    });

    const { rows } = await db.query(
      "SELECT * FROM entry WHERE kind = 'event' AND source_id = $1",
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("결혼기념일");
    expect(rows[0].text).toContain("결혼기념일");
    expect(rows[0].text).toContain("매년 이맘때");
    // The Entry's occurred_at is when the Event *happens*, which is the whole
    // requirement — not when the row was written.
    expect((rows[0].occurred_at as Date).toISOString()).toBe(
      new Date("2026-11-11T00:00:00+09:00").toISOString(),
    );
    // Whose doing it was, which is what News reads to show the other person's.
    expect(rows[0].person_id).toBe(towee);
  });

  test("even when the Event is in the future, which is the normal case", async () => {
    // A calendar is mostly future, and an index that filtered on "past" would
    // quietly make every upcoming Event unrecallable.
    const id = await anEvent({
      title: "제주 여행",
      occurredAt: "2030-05-01T09:00:00+09:00",
    });
    const { rows } = await db.query(
      "SELECT occurred_at FROM entry WHERE kind = 'event' AND source_id = $1",
      [id],
    );
    expect((rows[0].occurred_at as Date).getUTCFullYear()).toBe(2030);
  });

  test("and the Entry follows the Event when it is edited or deleted", async () => {
    const id = await anEvent({ title: "치과", occurredAt: "2026-09-01T10:00:00+09:00" });

    await db.query("UPDATE event SET title = $2, occurred_at = $3 WHERE id = $1", [
      id,
      "치과 (옮김)",
      "2026-09-08T10:00:00+09:00",
    ]);
    const updated = await db.query(
      "SELECT title, occurred_at FROM entry WHERE kind = 'event' AND source_id = $1",
      [id],
    );
    expect(updated.rows[0].title).toBe("치과 (옮김)");
    expect((updated.rows[0].occurred_at as Date).toISOString()).toBe(
      new Date("2026-09-08T10:00:00+09:00").toISOString(),
    );

    await db.query("DELETE FROM event WHERE id = $1", [id]);
    const gone = await db.query(
      "SELECT 1 FROM entry WHERE kind = 'event' AND source_id = $1",
      [id],
    );
    expect(gone.rows).toHaveLength(0);
  });
});

describe("the agenda", () => {
  test("returns Events in the window and nothing outside it", async () => {
    await anEvent({ title: "안쪽", occurredAt: "2026-08-22T19:00:00+09:00" });
    await anEvent({ title: "바깥", occurredAt: "2027-03-01T19:00:00+09:00" });

    const rows = await occurrences(
      "2026-08-01T00:00:00+09:00",
      "2026-09-01T00:00:00+09:00",
    );
    expect(rows.map((r) => r.title)).toEqual(["안쪽"]);
  });

  test("does not drop an Event once it has happened", async () => {
    // The past is reachable by scrolling up; Events do not vanish when they
    // happen. Asking for a past window is exactly what scrolling up does.
    await anEvent({ title: "작년 생일", occurredAt: "2025-03-14T00:00:00+09:00" });

    const rows = await occurrences(
      "2025-01-01T00:00:00+09:00",
      "2025-12-31T00:00:00+09:00",
    );
    expect(rows.map((r) => r.title)).toEqual(["작년 생일"]);
  });

  test("marks a one-off Event as not a repeat", async () => {
    await anEvent({ title: "이사", occurredAt: "2026-08-22T09:00:00+09:00" });
    const [row] = await occurrences(
      "2026-08-01T00:00:00+09:00",
      "2026-09-01T00:00:00+09:00",
    );
    expect(row.is_repeat).toBe(false);
    expect(row.repeats_yearly).toBe(false);
    // occurs_at and occurred_at agree when nothing was projected.
    expect(row.occurs_at.toISOString()).toBe(row.occurred_at.toISOString());
  });
});

describe("the yearly repeat flag", () => {
  test("projects an anniversary into a year it was never stored in", async () => {
    // The flag's entire job: one row in 2016, visible every November after.
    await anEvent({
      title: "결혼기념일",
      occurredAt: "2016-11-11T00:00:00+09:00",
      allDay: true,
      repeatsYearly: true,
    });

    const rows = await occurrences(
      "2026-01-01T00:00:00+09:00",
      "2027-01-01T00:00:00+09:00",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("결혼기념일");
    // Shown in 2026 …
    expect(rows[0].occurs_at.toISOString()).toBe(
      new Date("2026-11-11T00:00:00+09:00").toISOString(),
    );
    // … while still remembering it is a 2016 row, which is what makes
    // "10주년" computable at all.
    expect(rows[0].occurred_at.toISOString()).toBe(
      new Date("2016-11-11T00:00:00+09:00").toISOString(),
    );
    expect(rows[0].is_repeat).toBe(true);
  });

  test("stores one row however many years it is shown across", async () => {
    // No expansion, no instance rows. This is what "no RRULE" buys.
    await anEvent({
      title: "결혼기념일",
      occurredAt: "2016-11-11T00:00:00+09:00",
      repeatsYearly: true,
    });

    const stored = await db.query<{ n: string }>("SELECT count(*) AS n FROM event");
    expect(Number(stored.rows[0].n)).toBe(1);

    const decade = await occurrences(
      "2016-01-01T00:00:00+09:00",
      "2026-01-01T00:00:00+09:00",
    );
    expect(decade).toHaveLength(10);
  });

  test("has no occurrence before the Event itself", async () => {
    // Scrolling far enough back must not invent anniversaries that predate
    // the thing being remembered.
    await anEvent({
      title: "결혼기념일",
      occurredAt: "2016-11-11T00:00:00+09:00",
      repeatsYearly: true,
    });

    const before = await occurrences(
      "2010-01-01T00:00:00+09:00",
      "2016-01-01T00:00:00+09:00",
    );
    expect(before).toHaveLength(0);
  });

  test("counts its own first year as not a repeat", async () => {
    await anEvent({
      title: "결혼기념일",
      occurredAt: "2016-11-11T00:00:00+09:00",
      repeatsYearly: true,
    });
    const [first] = await occurrences(
      "2016-01-01T00:00:00+09:00",
      "2017-01-01T00:00:00+09:00",
    );
    expect(first.is_repeat).toBe(false);
  });

  test("survives the 29th of February instead of failing the whole agenda", async () => {
    // Postgres raises "date/time field value out of range" on Feb 29 in a
    // common year, which would take out the entire agenda three years in four
    // — a spectacular failure from one anniversary.
    await anEvent({
      title: "윤년 기념일",
      occurredAt: "2020-02-29T00:00:00+09:00",
      allDay: true,
      repeatsYearly: true,
    });

    const common = await occurrences(
      "2026-01-01T00:00:00+09:00",
      "2027-01-01T00:00:00+09:00",
    );
    expect(common).toHaveLength(1);
    // Resolved forward to March 1st, by decision.
    expect(common[0].occurs_at.toISOString()).toBe(
      new Date("2026-03-01T00:00:00+09:00").toISOString(),
    );

    const leap = await occurrences(
      "2028-01-01T00:00:00+09:00",
      "2029-01-01T00:00:00+09:00",
    );
    expect(leap[0].occurs_at.toISOString()).toBe(
      new Date("2028-02-29T00:00:00+09:00").toISOString(),
    );
  });

  test("carries the duration onto the projected year", async () => {
    // A repeating Event that spans days must still span them in the year it
    // is shown — not end ten years before it starts.
    await anEvent({
      title: "긴 연휴",
      occurredAt: "2016-11-11T00:00:00+09:00",
      endsAt: "2016-11-13T00:00:00+09:00",
      repeatsYearly: true,
    });

    const [row] = await occurrences(
      "2026-01-01T00:00:00+09:00",
      "2027-01-01T00:00:00+09:00",
    );
    expect(row.ends_at?.toISOString()).toBe(
      new Date("2026-11-13T00:00:00+09:00").toISOString(),
    );
  });

  test("keeps the Seoul wall-clock time across years", async () => {
    // The projection is done in Asia/Seoul, so a 7pm anniversary stays at 7pm
    // rather than drifting with the UTC offset arithmetic.
    await anEvent({
      title: "저녁 약속",
      occurredAt: "2016-11-11T19:00:00+09:00",
      repeatsYearly: true,
    });
    const [row] = await occurrences(
      "2026-01-01T00:00:00+09:00",
      "2027-01-01T00:00:00+09:00",
    );
    expect(row.occurs_at.toISOString()).toBe(
      new Date("2026-11-11T19:00:00+09:00").toISOString(),
    );
  });
});

describe("a Journey adopts Events by date range", () => {
  async function aJourney(title: string, started: string, ended: string | null) {
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO journey (title, started_on, ended_on) VALUES ($1, $2, $3) RETURNING id",
      [title, started, ended],
    );
    return rows[0].id;
  }

  const adopted = async (journeyId: string) => {
    const { rows } = await db.query<{ title: string; occurs_at: Date }>(
      "SELECT title, occurs_at FROM journey_events($1) ORDER BY occurs_at",
      [journeyId],
    );
    return rows;
  };

  test("gathers the Events inside its span and no others", async () => {
    const jeju = await aJourney("제주, 2026년 10월", "2026-10-03", "2026-10-07");
    await anEvent({ title: "비행기", occurredAt: "2026-10-03T08:00:00+09:00" });
    await anEvent({ title: "흑돼지", occurredAt: "2026-10-05T19:00:00+09:00" });
    await anEvent({ title: "그 전 주", occurredAt: "2026-09-25T19:00:00+09:00" });
    await anEvent({ title: "그 다음 주", occurredAt: "2026-10-20T19:00:00+09:00" });

    expect((await adopted(jeju)).map((r) => r.title)).toEqual(["비행기", "흑돼지"]);
  });

  test("includes the whole of the last day, not up to its midnight", async () => {
    // An Event at 8pm on the final evening of a trip belongs to the trip. An
    // off-by-one here silently drops the last night of every Journey.
    const jeju = await aJourney("제주", "2026-10-03", "2026-10-07");
    await anEvent({ title: "마지막 저녁", occurredAt: "2026-10-07T20:00:00+09:00" });
    await anEvent({ title: "돌아온 뒤", occurredAt: "2026-10-08T09:00:00+09:00" });

    expect((await adopted(jeju)).map((r) => r.title)).toEqual(["마지막 저녁"]);
  });

  test("adopts a projected anniversary, not just rows stored in the span", async () => {
    // The 2026 occurrence of a 2016 anniversary is inside a 2026 Journey even
    // though the row is a decade old.
    const journey = await aJourney("결혼 10주년", "2026-11-01", "2026-11-30");
    await anEvent({
      title: "결혼기념일",
      occurredAt: "2016-11-11T00:00:00+09:00",
      repeatsYearly: true,
    });

    expect((await adopted(journey)).map((r) => r.title)).toEqual(["결혼기념일"]);
  });

  test("a Journey we are still in adopts what comes after its start", async () => {
    const ongoing = await aJourney("이사", "2026-08-01", null);
    await anEvent({ title: "계약", occurredAt: "2026-08-10T14:00:00+09:00" });
    await anEvent({ title: "그 전", occurredAt: "2026-07-01T14:00:00+09:00" });

    expect((await adopted(ongoing)).map((r) => r.title)).toEqual(["계약"]);
  });

  test("neither creates the other", async () => {
    // Adoption is by date range and nothing is written on either side. There
    // is no journey_id on event, and adding an Event inside a span must not
    // edit the Journey.
    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'event' AND column_name = 'journey_id'`,
    );
    expect(columns.rows).toHaveLength(0);

    const jeju = await aJourney("제주", "2026-10-03", "2026-10-07");
    const before = await db.query("SELECT * FROM journey WHERE id = $1", [jeju]);
    await anEvent({ title: "비행기", occurredAt: "2026-10-04T08:00:00+09:00" });
    const after = await db.query("SELECT * FROM journey WHERE id = $1", [jeju]);
    expect(after.rows[0]).toEqual(before.rows[0]);

    // And moving the Journey re-adopts, because the dates are the only answer.
    await db.query("UPDATE journey SET ended_on = '2026-10-04' WHERE id = $1", [jeju]);
    expect((await adopted(jeju)).map((r) => r.title)).toEqual(["비행기"]);
    await db.query("UPDATE journey SET ended_on = '2026-10-03' WHERE id = $1", [jeju]);
    expect(await adopted(jeju)).toHaveLength(0);
  });
});

describe("an imminent Event is visible to News", () => {
  test("appears in the imminent view when it is nearly here", async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    await anEvent({ title: "곧 있을 일", occurredAt: soon, personId: yangcho });

    const { rows } = await db.query<{ title: string; person_id: string }>(
      "SELECT title, person_id FROM imminent_event",
    );
    expect(rows.map((r) => r.title)).toContain("곧 있을 일");
    // News shows the *other* person's doing, and reads this to know whose.
    expect(rows[0].person_id).toBe(yangcho);
  });

  test("does not appear when it is far off or already past", async () => {
    await anEvent({
      title: "먼 미래",
      occurredAt: new Date(Date.now() + 60 * 86_400_000).toISOString(),
    });
    await anEvent({
      title: "지난 일",
      occurredAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    });

    const { rows } = await db.query<{ title: string }>(
      "SELECT title FROM imminent_event",
    );
    expect(rows.map((r) => r.title)).not.toContain("먼 미래");
    expect(rows.map((r) => r.title)).not.toContain("지난 일");
  });

  test("an anniversary becomes imminent on its projection, not on its stored date", async () => {
    // The point of routing News through the projection: a 2016 row is news in
    // the week before this year's occurrence, which is invisible if you read
    // event.occurred_at directly.
    const soon = new Date(Date.now() + 3 * 86_400_000);
    const yearsAgo = new Date(soon);
    yearsAgo.setUTCFullYear(soon.getUTCFullYear() - 10);

    await anEvent({
      title: "오래된 기념일",
      occurredAt: yearsAgo.toISOString(),
      repeatsYearly: true,
    });

    const { rows } = await db.query<{ title: string; is_repeat: boolean }>(
      "SELECT title, is_repeat FROM imminent_event",
    );
    expect(rows.map((r) => r.title)).toContain("오래된 기념일");
    expect(rows[0].is_repeat).toBe(true);
  });

  test("carries the original date under a name that is not occurred_at", async () => {
    // `occurred_at` is the primary time axis and a schema test asserts exactly
    // which things carry one — a derived view must not answer that question.
    // The date is still there, as `stored_on`, which is the truer word for it.
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const id = await anEvent({ title: "곧", occurredAt: soon });

    const { rows } = await db.query<{ stored_on: Date; occurs_at: Date }>(
      "SELECT stored_on, occurs_at FROM imminent_event WHERE event_id = $1",
      [id],
    );
    expect(rows[0].stored_on.toISOString()).toBe(new Date(soon).toISOString());

    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'imminent_event' AND column_name = 'occurred_at'`,
    );
    expect(columns.rows).toHaveLength(0);
  });

  test("carries the Entry id, so News joins the index it already reads", async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const id = await anEvent({ title: "곧", occurredAt: soon });

    const { rows } = await db.query<{ entry_id: string | null }>(
      "SELECT entry_id FROM imminent_event WHERE event_id = $1",
      [id],
    );
    expect(rows[0].entry_id).not.toBeNull();
  });

  test("nothing about it is stored — it is a view, not a table", async () => {
    // ADR-0015: News is derived. A reminders table is the reflex and it is
    // the thing this ticket must not build.
    const { rows } = await db.query<{ table_type: string }>(
      `SELECT table_type FROM information_schema.tables WHERE table_name = 'imminent_event'`,
    );
    expect(rows[0].table_type).toBe("VIEW");

    // And there is no reminder table anywhere.
    const reminders = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE '%remind%'`,
    );
    expect(reminders.rows).toHaveLength(0);
  });
});

describe("the calendar is shared, and RLS says so", () => {
  test("either of us sees an Event the other created", async () => {
    await anEvent({ title: "양초가 넣은 일정", occurredAt: "2026-08-22T19:00:00+09:00", personId: yangcho });

    // No per-person ownership: the calendar is shared outright.
    const seen = await asPerson(db, towee, async () => {
      const { rows } = await db.query<{ title: string }>(
        "SELECT title FROM event_occurrences($1, $2)",
        ["2026-08-01T00:00:00+09:00", "2026-09-01T00:00:00+09:00"],
      );
      return rows.map((r) => r.title);
    });
    expect(seen).toEqual(["양초가 넣은 일정"]);
  });

  test("either of us may edit and delete the other's Event", async () => {
    const id = await anEvent({
      title: "원래 제목",
      occurredAt: "2026-08-22T19:00:00+09:00",
      personId: yangcho,
    });

    await asPerson(db, towee, async () => {
      await db.query("UPDATE event SET title = '고친 제목' WHERE id = $1", [id]);
      const { rows } = await db.query<{ title: string }>(
        "SELECT title FROM event WHERE id = $1",
        [id],
      );
      expect(rows[0].title).toBe("고친 제목");

      await db.query("DELETE FROM event WHERE id = $1", [id]);
      const gone = await db.query("SELECT 1 FROM event WHERE id = $1", [id]);
      expect(gone.rows).toHaveLength(0);
    });
  });

  test("either of us may create one", async () => {
    await asPerson(db, yangcho, async () => {
      await db.query(
        `INSERT INTO event (title, occurred_at, person_id) VALUES ($1, $2, $3)`,
        ["새 일정", "2026-08-22T19:00:00+09:00", yangcho],
      );
      const { rows } = await db.query("SELECT 1 FROM event WHERE title = '새 일정'");
      expect(rows).toHaveLength(1);
    });
  });

  test("a stranger sees no Events at all", async () => {
    await anEvent({ title: "비밀", occurredAt: "2026-08-22T19:00:00+09:00" });

    // The agenda is not security definer, so RLS applies to it exactly as it
    // applies to a direct select — zero rows, which is the same answer.
    const seen = await asPerson(db, null, async () => {
      const { rows } = await db.query("SELECT title FROM event_occurrences($1, $2)", [
        "2026-08-01T00:00:00+09:00",
        "2026-09-01T00:00:00+09:00",
      ]);
      return rows;
    });
    expect(seen).toHaveLength(0);
  });

  test("a stranger sees nothing through the Journey or the News view either", async () => {
    const { rows: j } = await db.query<{ id: string }>(
      "INSERT INTO journey (title, started_on, ended_on) VALUES ('제주','2026-10-03','2026-10-07') RETURNING id",
    );
    await anEvent({ title: "비행기", occurredAt: "2026-10-04T08:00:00+09:00" });
    await anEvent({
      title: "곧",
      occurredAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    });

    await asPerson(db, null, async () => {
      const journey = await db.query("SELECT * FROM journey_events($1)", [j[0].id]);
      expect(journey.rows).toHaveLength(0);
      const news = await db.query("SELECT * FROM imminent_event");
      expect(news.rows).toHaveLength(0);
    });
  });
});

describe("what the calendar deliberately does not have", () => {
  test("no expansion table, no exception rows, no series-versus-instance", async () => {
    // The ticket's hardest line: recurrence is one flag plus a date. If a
    // future session reaches for RRULE, this is what should stop them — the
    // absence is the decision, not an omission.
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND (table_name LIKE '%occurrence%' OR table_name LIKE '%recurrence%'
               OR table_name LIKE '%instance%' OR table_name LIKE '%exception%')
          AND table_type = 'BASE TABLE'`,
    );
    expect(rows).toHaveLength(0);

    // And the flag is still exactly a boolean, not a rule string.
    const column = await db.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'event' AND column_name = 'repeats_yearly'`,
    );
    expect(column.rows[0].data_type).toBe("boolean");

    const rrule = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'event' AND (column_name LIKE '%rrule%' OR column_name LIKE '%recurrence%')`,
    );
    expect(rrule.rows).toHaveLength(0);
  });
});
