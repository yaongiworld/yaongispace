import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Client } from "pg";
import { asPerson, migrate } from "./db";
import { reset, twoPeople } from "./world";

/**
 * News, against the real database.
 *
 * Every assertion here runs through `asPerson`, and that is not a formality.
 * The database owner bypasses RLS entirely, so a query run as the owner sees
 * every sealed Letter in the archive — which means the single most important
 * property in this file, that a sealed letter is invisible until its date,
 * would pass trivially and prove nothing. The feed is only correct *as a
 * signed-in Person*, so that is the only way it is tested.
 *
 * The seal is the other thing worth stating up front. Two separate notions of
 * "read" collide here: seeing a Letter mentioned in News, and opening the
 * Letter itself. Only the second seals it. Because a sealed Letter is
 * immutable, collapsing the two would silently lock letters their author could
 * still have fixed — with no undo — and it would look like a tidy
 * simplification while doing it.
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

/** A News row as the view returns it. */
interface NewsRow {
  entry_id: string;
  kind: string;
  source_id: string;
  title: string | null;
  person_id: string;
  person_name: string;
  journey_id: string | null;
  journey_title: string | null;
  arrived_at: Date;
}

/** The raw feed, newest arrival first, as `person` sees it. */
async function newsFor(person: string): Promise<NewsRow[]> {
  return asPerson(db, person, async () => {
    const { rows } = await db.query<NewsRow>(
      "SELECT * FROM news ORDER BY arrived_at DESC",
    );
    return rows;
  });
}

/**
 * Write a Letter with a chosen arrival time.
 *
 * `created_at` has a default of `now()` and News sorts by it, so a test about
 * ordering has to be able to say when something arrived. Set as the owner,
 * before any of the assertions — this is fixture setup standing in for the
 * passage of time, not something the app can do.
 */
async function letterArriving(
  author: string,
  recipient: string,
  title: string,
  createdAt: string,
  options: { unsealAt?: string; occurredAt?: string } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO letter (author_id, recipient_id, title, body, unseal_at, occurred_at, created_at)
     VALUES ($1, $2, $3, '오늘 하루도 고마웠어', $4, coalesce($5::timestamptz, now()), $6)
     RETURNING id`,
    [author, recipient, title, options.unsealAt ?? null, options.occurredAt ?? null, createdAt],
  );
  return rows[0].id;
}

const ago = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();

// ---------------------------------------------------------------------------
// Whose doing it is
// ---------------------------------------------------------------------------

test("News is the other one's doing, never your own", async () => {
  await letterArriving(towee, yangcho, "토위가 쓴 편지", ago(1));
  await letterArriving(yangcho, towee, "양초가 쓴 편지", ago(1));

  // Each of us sees exactly what the other did, and nothing of our own. This
  // is the rule that keeps the feed from being a log of yourself.
  const mine = await newsFor(towee);
  expect(mine.map((n) => n.title)).toEqual(["양초가 쓴 편지"]);
  expect(mine[0].person_id).toBe(yangcho);
  expect(mine[0].person_name).toBe("양초");

  const hers = await newsFor(yangcho);
  expect(hers.map((n) => n.title)).toEqual(["토위가 쓴 편지"]);
});

test("an Entry belonging to nobody in particular is not News", async () => {
  // A Journey has a null person_id — it is a span of our life, not an act by
  // one of us. `person_id <> current_person_id()` is a plain comparison rather
  // than `is distinct from` precisely so these do not become news.
  await db.query(
    "INSERT INTO journey (title, started_on) VALUES ('신혼', current_date)",
  );

  expect(await newsFor(towee)).toEqual([]);
  expect(await newsFor(yangcho)).toEqual([]);
});

// ---------------------------------------------------------------------------
// The time axis
// ---------------------------------------------------------------------------

test("News orders by when a thing arrived, not when it happened", async () => {
  // The case ADR-0015 is written around: a Letter composed today *about* last
  // October. Under occurred-at ordering it sorts into October and is never
  // seen; News is about arrival, so it is today's news.
  await letterArriving(yangcho, towee, "어제 온 편지", ago(2));
  await letterArriving(yangcho, towee, "제주 이야기", ago(1), {
    occurredAt: "2025-10-05T21:00:00+09:00",
  });

  const feed = await newsFor(towee);
  expect(feed.map((n) => n.title)).toEqual(["제주 이야기", "어제 온 편지"]);
});

test("News is a rolling window, not a history", async () => {
  await letterArriving(yangcho, towee, "이번 달", ago(3));
  await letterArriving(yangcho, towee, "작년 이맘때", ago(400));

  // ~30 days. The timeline, the Journey and Recall are where history lives —
  // the feed deliberately forgets.
  const feed = await newsFor(towee);
  expect(feed.map((n) => n.title)).toEqual(["이번 달"]);
});

// ---------------------------------------------------------------------------
// The seal
// ---------------------------------------------------------------------------

test("a sealed Letter is not News until its unseal date", async () => {
  await letterArriving(yangcho, towee, "10주년에 열어줘", ago(1), {
    unsealAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
  });

  // Invisible to its recipient — not merely unsorted, absent. There is no
  // countdown and no placeholder anywhere in the feed, because the existence
  // of the letter is itself the surprise.
  expect(await newsFor(towee)).toEqual([]);

  // And invisible in the feed to its author too, for a different reason: News
  // is only ever the *other* person's doing.
  expect(await newsFor(yangcho)).toEqual([]);
});

test("the feed reads Entries as the caller, so the seal cannot be laundered through the view", async () => {
  // A Postgres view reads its base tables as the view's *owner* unless it is
  // declared `security_invoker`. This view is owned by a role with
  // `rolbypassrls`, so without that option `entry_readable` is evaluated as
  // the owner and the view hands back a Letter sealed until 2036 — while a
  // direct select on `entry` from the same transaction correctly returns
  // nothing.
  //
  // This was a real bug in this migration, and it is the kind worth a test of
  // its own: silent, invisible to any assertion written as the owner, and what
  // it leaks is the one thing with no undo.
  await letterArriving(yangcho, towee, "2036년에", ago(1), {
    unsealAt: new Date(Date.now() + 3650 * 86_400_000).toISOString(),
  });

  await asPerson(db, towee, async () => {
    const direct = await db.query("SELECT 1 FROM entry");
    const viaView = await db.query("SELECT 1 FROM news");
    // The view must agree with the table it is built on, not out-see it.
    expect(direct.rowCount).toBe(0);
    expect(viaView.rowCount).toBe(0);
  });
});

test("a sealed Letter's news fires on its unseal date, not the day it was written", async () => {
  // Written a fortnight ago, sealed until yesterday. Its news is yesterday's,
  // which is what puts it at the top of the feed rather than two weeks down —
  // and `unseal_at` lives on `letter`, not on `entry`, so nothing but a join
  // could know this.
  await letterArriving(yangcho, towee, "봉인이 풀린 편지", ago(14), {
    unsealAt: ago(1),
  });
  await letterArriving(yangcho, towee, "그저께 온 편지", ago(2));

  const feed = await newsFor(towee);
  expect(feed.map((n) => n.title)).toEqual(["봉인이 풀린 편지", "그저께 온 편지"]);

  // Its arrival is the unseal date, not the creation date.
  const arrived = feed[0].arrived_at.getTime();
  expect(Math.abs(arrived - Date.parse(ago(1)))).toBeLessThan(5_000);
});

test("a letter sealed longer ago than the window has already passed out of News", async () => {
  // The window applies to arrival, so a letter unsealed 40 days ago is old
  // news even though it is only just readable in the letterbox sense.
  await letterArriving(yangcho, towee, "오래전 풀린 편지", ago(400), {
    unsealAt: ago(40),
  });
  expect(await newsFor(towee)).toEqual([]);
});

test("listing News does not seal a Letter", async () => {
  // The acceptance criterion this whole ticket turns on. Feed-read and
  // letter-read are two separate notions: only `open_letter()` seals, 004's
  // trigger refuses every other route, and a News query that touched
  // `read_at` would fail loudly rather than quietly — but it must not even
  // try. A sealed Letter is immutable, so a feed that sealed on sight would
  // lock letters their author could still have fixed, permanently.
  const id = await letterArriving(yangcho, towee, "아직 안 읽은 편지", ago(1));

  const feed = await newsFor(towee);
  expect(feed.map((n) => n.source_id)).toEqual([id]);

  const { rows } = await db.query<{ read_at: Date | null }>(
    "SELECT read_at FROM letter WHERE id = $1",
    [id],
  );
  expect(rows[0].read_at).toBeNull();

  // Reading the feed a second time is still not reading the letter.
  await newsFor(towee);
  const { rows: again } = await db.query<{ read_at: Date | null }>(
    "SELECT read_at FROM letter WHERE id = $1",
    [id],
  );
  expect(again[0].read_at).toBeNull();
});

// ---------------------------------------------------------------------------
// The seen marker
// ---------------------------------------------------------------------------

test("looking at News marks it seen for the looker alone", async () => {
  const seen = await asPerson(db, towee, async () => {
    const { rows } = await db.query<{ see_news: Date | null }>("SELECT see_news()");
    // Read it back inside the same transaction — `asPerson` rolls back.
    const { rows: after } = await db.query<{ news_seen_at: Date | null }>(
      "SELECT news_seen_at FROM person WHERE id = $1",
      [towee],
    );
    const { rows: other } = await db.query<{ news_seen_at: Date | null }>(
      "SELECT news_seen_at FROM person WHERE id = $1",
      [yangcho],
    );
    return {
      returned: rows[0].see_news,
      mine: after[0].news_seen_at,
      hers: other[0].news_seen_at,
    };
  });

  expect(seen.returned).not.toBeNull();
  expect(seen.mine).not.toBeNull();
  // The caller cannot name anybody but themselves, so the other one's marker
  // is untouched — marking Yangcho's news seen would hide from her something
  // she had never looked at.
  expect(seen.hers).toBeNull();
});

test("the seen marker only ever moves forward", async () => {
  // A page that renders twice, or a stale tab posting late, must not drag the
  // marker backwards and resurrect news that was already dismissed.
  const future = new Date(Date.now() + 3_600_000).toISOString();
  await db.query("UPDATE person SET news_seen_at = $2 WHERE id = $1", [towee, future]);

  const after = await asPerson(db, towee, async () => {
    await db.query("SELECT see_news()");
    const { rows } = await db.query<{ news_seen_at: Date }>(
      "SELECT news_seen_at FROM person WHERE id = $1",
      [towee],
    );
    return rows[0].news_seen_at;
  });

  expect(after.getTime()).toBe(Date.parse(future));
});

test("a rebuild of the Entry index does not resurrect dismissed news", async () => {
  // The reason read state is stored rather than derived (ADR-0015).
  //
  // `rebuild_entry_index()` deletes every Entry and re-creates it from the
  // source tables, which gives every row a fresh `created_at`. If "have I seen
  // this?" were computed from the Entry — by comparing against its arrival, or
  // by any other property of the index — a *repair* would hand back every
  // piece of news already dismissed. The marker survives the rebuild because
  // it lives on `person`, which the rebuild does not touch.
  await letterArriving(yangcho, towee, "읽고 지나간 소식", ago(1));

  await asPerson(db, towee, async () => {
    expect(await db.query("SELECT 1 FROM news")).toHaveProperty("rowCount", 1);
    await db.query("SELECT see_news()");
  });
  // `asPerson` rolls back, so mark it seen for real, as the app would.
  await db.query("UPDATE person SET news_seen_at = now() WHERE id = $1", [towee]);

  const before = await db.query<{ news_seen_at: Date }>(
    "SELECT news_seen_at FROM person WHERE id = $1",
    [towee],
  );

  await db.query("SELECT rebuild_entry_index()");

  const after = await db.query<{ news_seen_at: Date }>(
    "SELECT news_seen_at FROM person WHERE id = $1",
    [towee],
  );
  expect(after.rows[0].news_seen_at.getTime()).toBe(
    before.rows[0].news_seen_at.getTime(),
  );

  // The feed still holds the item — News is a window, not a read log — and
  // crucially it still claims to have arrived *yesterday*, not at the moment
  // of the repair. This is the half a derived arrival time would have broken:
  // `entry.created_at` is reset by the rebuild, so News reads the source row's
  // instead. Were it otherwise, every dismissed item would re-date itself into
  // the future of the seen marker and be unread again.
  const feed = await newsFor(towee);
  expect(feed).toHaveLength(1);
  const arrivedDaysAgo =
    (Date.now() - feed[0].arrived_at.getTime()) / 86_400_000;
  expect(arrivedDaysAgo).toBeGreaterThan(0.5);
  expect(feed[0].arrived_at.getTime()).toBeLessThan(
    after.rows[0].news_seen_at.getTime(),
  );
});

// ---------------------------------------------------------------------------
// Nothing is stored
// ---------------------------------------------------------------------------

test("News stores nothing but a timestamp", async () => {
  // ADR-0015's central claim, asserted rather than trusted. If a later session
  // adds a `news` *table*, this fails — which is the point, because the feed
  // becoming a stored table is a reversal of the decision, not a refinement.
  const { rows } = await db.query<{ table_type: string }>(
    `SELECT table_type FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'news'`,
  );
  expect(rows).toEqual([{ table_type: "VIEW" }]);

  // And no notification-shaped table crept in beside it.
  const { rows: tables } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND (table_name LIKE '%notification%' OR table_name LIKE '%news%'
             OR table_name LIKE '%activity%' OR table_name LIKE '%alert%')`,
  );
  expect(tables).toEqual([]);
});
