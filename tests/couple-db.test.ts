import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { Pool } from "pg";
import { TEST_DATABASE_URL, asPerson, migrate } from "./db";
import { reset, twoPeople } from "./world";

/**
 * Migration 009 against a real Postgres: the day tables, workouts, eras and
 * the widened News view — as each of us, with RLS on.
 */

let db: Client;
let towee: string;
let yangcho: string;
let workouts: typeof import("@/lib/workout/store");
let todayStore: typeof import("@/lib/today/store");
let eraStore: typeof import("@/lib/era/store");
let couple: typeof import("@/lib/couple");
let asPersonApp: typeof import("@/lib/as-person").asPerson;

beforeAll(async () => {
  db = await migrate();
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  workouts = await import("@/lib/workout/store");
  todayStore = await import("@/lib/today/store");
  eraStore = await import("@/lib/era/store");
  couple = await import("@/lib/couple");
  asPersonApp = (await import("@/lib/as-person")).asPerson;
});

afterAll(async () => {
  await db?.end();
  const globalForDb = globalThis as unknown as { yaongiPool?: Pool };
  await globalForDb.yaongiPool?.end();
  globalForDb.yaongiPool = undefined;
});

beforeEach(async () => {
  await reset(db);
  ({ towee, yangcho } = await twoPeople(db));
});

const DAY = "2026-11-01";

const newsAs = async (person: string) =>
  asPerson(db, person, async () => {
    const { rows } = await db.query<{ kind: string; title: string | null; person_id: string }>(
      "SELECT kind, title, person_id FROM news ORDER BY arrived_at DESC",
    );
    return rows;
  });

describe("the day tables", () => {
  test("each of us sets only our own mood, and both of us read both", async () => {
    await todayStore.setMood(yangcho, DAY, "happy");

    await expect(
      asPerson(db, towee, () =>
        db.query("INSERT INTO day_mood (person_id, day, mood) VALUES ($1, $2, 'sad')", [yangcho, DAY]),
      ),
    ).rejects.toThrow(/row-level security/);

    const seen = await asPerson(db, towee, async () => (await db.query("SELECT mood FROM day_mood")).rows);
    expect(seen).toEqual([{ mood: "happy" }]);
  });

  test("a mood is one per person per day; pressing again replaces it", async () => {
    await todayStore.setMood(towee, DAY, "happy");
    await todayStore.setMood(towee, DAY, "tired");
    const { rows } = await db.query("SELECT mood FROM day_mood WHERE person_id = $1", [towee]);
    expect(rows).toEqual([{ mood: "tired" }]);
  });

  test("refuses a mood that is not on the list", async () => {
    await expect(
      db.query("INSERT INTO day_mood (person_id, day, mood) VALUES ($1, $2, 'meh')", [towee, DAY]),
    ).rejects.toThrow(/check/);
  });

  test("the leaving clock keeps to 10 minutes, and 나왔어요 can be undone", async () => {
    await todayStore.setLeaveMinute(yangcho, DAY, 18 * 60 + 30);
    await expect(todayStore.setLeaveMinute(yangcho, DAY, 18 * 60 + 35)).rejects.toThrow(/check/);

    await todayStore.markLeft(yangcho, DAY);
    const first = (await db.query("SELECT left_at FROM day_offwork")).rows[0].left_at;
    await todayStore.markLeft(yangcho, DAY);
    const second = (await db.query("SELECT left_at FROM day_offwork")).rows[0].left_at;
    expect(second).toEqual(first);

    await todayStore.unmarkLeft(yangcho, DAY);
    const after = (await db.query("SELECT leave_minute, left_at FROM day_offwork")).rows;
    expect(after).toEqual([{ leave_minute: 1110, left_at: null }]);
  });

  test("an empty memo removes the line", async () => {
    await todayStore.setMemo(towee, DAY, "  오늘은   하늘이 예뻤다 ");
    expect((await db.query("SELECT body FROM day_memo")).rows).toEqual([{ body: "오늘은 하늘이 예뻤다" }]);
    await todayStore.setMemo(towee, DAY, "   ");
    expect((await db.query("SELECT body FROM day_memo")).rows).toEqual([]);
  });

  test("reads both people's day, by cat", async () => {
    await todayStore.setMood(yangcho, DAY, "excited");
    await todayStore.setLeaveMinute(towee, DAY, 1080);
    const day = await asPersonApp(towee, async (c) =>
      todayStore.dayFor(c, await couple.loadCouple(c, towee), DAY),
    );
    expect(day.yangcho.mood).toBe("excited");
    expect(day.towee).toMatchObject({ mood: null, leaveMinute: 1080, leftAt: null });
  });
});

describe("workouts", () => {
  const run = (personId: string, distanceM = 3000) => ({
    personId,
    day: DAY,
    kind: "cardio" as const,
    exerciseId: "outdoor_run",
    distanceM,
    minutes: 30,
  });

  test("either of us can write one for the other, signed as ourselves", async () => {
    const w = await workouts.addWorkout(yangcho, run(towee));
    expect(w).toMatchObject({ personId: towee, enteredBy: yangcho });

    await expect(
      asPerson(db, yangcho, () =>
        db.query(
          `INSERT INTO workout (person_id, entered_by, day, kind, exercise_id)
           VALUES ($1, $1, $2, 'stretch', 'stretch')`,
          [towee, DAY],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  test("the other one may fix it, but who wrote it down stays", async () => {
    const w = await workouts.addWorkout(yangcho, run(towee));
    const fixed = await workouts.updateWorkout(towee, w.id, run(towee, 4200));
    expect(fixed).toMatchObject({ distanceM: 4200, enteredBy: yangcho });

    await expect(db.query("UPDATE workout SET entered_by = $1", [towee])).rejects.toThrow(/does not change/);
  });

  test("whose workout, its kind and its era cannot be moved by a fix", async () => {
    const w = await workouts.addWorkout(yangcho, run(yangcho));
    await expect(db.query("UPDATE workout SET person_id = $1 WHERE id = $2", [towee, w.id])).rejects.toThrow(/do not change/);
    await expect(
      db.query("UPDATE workout SET kind = 'stretch', distance_m = null, minutes = null, era_id = null WHERE id = $1", [w.id]),
    ).rejects.toThrow(/do not change/);
  });

  test("a new workout is signed by whoever wrote it, in both columns", async () => {
    await expect(
      asPerson(db, yangcho, () =>
        db.query(
          `INSERT INTO workout (person_id, entered_by, updated_by, day, kind, exercise_id)
           VALUES ($1, $1, $2, $3, 'stretch', 'stretch')`,
          [yangcho, towee, DAY],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  test("each kind carries only its own numbers", async () => {
    await expect(
      db.query(
        `INSERT INTO workout (person_id, entered_by, day, kind, exercise_id, weight_dg, reps)
         VALUES ($1, $1, $2, 'strength', 'rdl', 400, 10)`,
        [towee, DAY],
      ),
    ).rejects.toThrow(/check/);
    await expect(
      db.query(
        `INSERT INTO workout (person_id, entered_by, day, kind, exercise_id, distance_m, minutes, era_id)
         VALUES ($1, $1, $2, 'cardio', 'outdoor_run', 1050, 10, 'south_america')`,
        [towee, DAY],
      ),
    ).rejects.toThrow(/check/);
  });

  test("the form opens on the last values, so an unchanged workout is two taps", async () => {
    await workouts.addWorkout(towee, run(towee, 5200));
    await workouts.addWorkout(towee, { personId: towee, day: DAY, kind: "strength", exerciseId: "rdl", weightDg: 300 });
    await workouts.addWorkout(towee, { personId: towee, day: DAY, kind: "strength", exerciseId: "rdl", weightDg: 325 });

    const d = await asPersonApp(towee, (c) => workouts.defaultsFor(c, towee));
    expect(d.kind).toBe("strength");
    expect(d.cardio).toEqual({ exerciseId: "outdoor_run", distanceM: 5200, minutes: 30 });
    expect(d.weightDg).toEqual({ rdl: 325 });
    expect(d.lastStrength).toBe("rdl");
  });

  test("defaults for someone who has never logged anything", async () => {
    const d = await asPersonApp(yangcho, (c) => workouts.defaultsFor(c, yangcho));
    expect(d.kind).toBe("cardio");
    expect(d.cardio.distanceM).toBe(3000);
  });
});

describe("Era", () => {
  test("adds both people's cardio, solo days included, and nothing else", async () => {
    await workouts.addWorkout(yangcho, { personId: yangcho, day: DAY, kind: "cardio", exerciseId: "outdoor_run", distanceM: 3000, minutes: 25 });
    await workouts.addWorkout(towee, { personId: towee, day: "2026-10-30", kind: "cardio", exerciseId: "indoor_bike", distanceM: 8200, minutes: 30 });
    await workouts.addWorkout(towee, { personId: towee, day: DAY, kind: "core", exerciseId: "crunch", reps: 30 });

    const t = await asPersonApp(towee, async (c) =>
      eraStore.eraTotals(c, await couple.loadCouple(c, towee), "south_america"),
    );
    // 3.0 + 8.2 = 11.2km, one to one, no conversion (the prototype's rule).
    expect(t).toEqual({ totalM: 11_200, byCat: { yangcho: 3000, towee: 8200 }, count: 2 });
  });

  test("a deleted run leaves the total", async () => {
    const w = await workouts.addWorkout(yangcho, { personId: yangcho, day: DAY, kind: "cardio", exerciseId: "outdoor_run", distanceM: 3000, minutes: 25 });
    await workouts.deleteWorkout(towee, w.id);
    const t = await asPersonApp(towee, async (c) =>
      eraStore.eraTotals(c, await couple.loadCouple(c, towee), "south_america"),
    );
    expect(t.totalM).toBe(0);
  });

  test("only South America is open", async () => {
    const { rows } = await db.query("SELECT id FROM era");
    expect(rows).toEqual([{ id: "south_america" }]);
  });
});

describe("saying which cat you are (claim_cat)", () => {
  // Not through `asPerson`, which rolls back: a claim has to stick for the
  // next one to see it. The claim is set for the session and cleared after.
  const claim = async (person: string, cat: string) => {
    await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ person_id: person })]);
    try {
      return (await db.query("SELECT claim_cat($1) AS cat", [cat])).rows[0].cat;
    } finally {
      await db.query("SELECT set_config('request.jwt.claims', '', false)");
    }
  };

  test("one answer settles both of us", async () => {
    await db.query("UPDATE person SET display_name = 'Gee' WHERE id = $1", [yangcho]);
    await db.query("UPDATE person SET display_name = 'Tony' WHERE id = $1", [towee]);
    expect(await claim(yangcho, "yangcho")).toBe("yangcho");
    const { rows } = await db.query("SELECT id, cat FROM person ORDER BY cat");
    expect(rows).toEqual([
      { id: towee, cat: "towee" },
      { id: yangcho, cat: "yangcho" },
    ]);
  });

  test("cannot take a cat that is taken, nor change one already set", async () => {
    await claim(towee, "towee");
    expect(await claim(yangcho, "towee")).toBe("yangcho"); // already settled by the first answer
    expect(await claim(towee, "yangcho")).toBe("towee");
  });

  test("names in News are 양초 and 토위 once the cats are known", async () => {
    await db.query("UPDATE person SET display_name = 'Gee', cat = 'yangcho' WHERE id = $1", [yangcho]);
    await db.query("UPDATE person SET display_name = 'Tony', cat = 'towee' WHERE id = $1", [towee]);
    await todayStore.setMood(yangcho, DAY, "happy");
    const names = await asPerson(db, towee, async () => (await db.query("SELECT person_name FROM news")).rows);
    expect(names).toEqual([{ person_name: "양초" }]);
  });
});

describe("News, widened (충돌 6)", () => {
  test("the other one's mood and leaving time are News; your own are not", async () => {
    await todayStore.setMood(yangcho, DAY, "happy");
    await todayStore.setLeaveMinute(yangcho, DAY, 1110);

    const toTowee = await newsAs(towee);
    expect(toTowee.map((n) => [n.kind, n.title]).sort()).toEqual([
      ["mood", "happy"],
      ["offwork", "18:30"],
    ]);
    expect(await newsAs(yangcho)).toEqual([]);
  });

  test("나왔어요 reads as left", async () => {
    await todayStore.markLeft(towee, DAY);
    expect((await newsAs(yangcho)).map((n) => n.title)).toEqual(["left"]);
  });

  test("a workout written for you is News to you, from the one who wrote it", async () => {
    await workouts.addWorkout(yangcho, { personId: towee, day: DAY, kind: "stretch", exerciseId: "stretch" });
    expect(await newsAs(towee)).toEqual([{ kind: "workout_for", title: "stretch", person_id: yangcho }]);
    expect(await newsAs(yangcho)).toEqual([]);
  });

  test("your own workouts are not News to anyone", async () => {
    await workouts.addWorkout(towee, { personId: towee, day: DAY, kind: "stretch", exerciseId: "stretch" });
    expect(await newsAs(yangcho)).toEqual([]);
    expect(await newsAs(towee)).toEqual([]);
  });
});

describe("the protein counter (010)", () => {
  test("one tap is +1, a mis-tap comes back off, and it never goes below 0 or above 20", async () => {
    expect(await todayStore.addProtein(yangcho, DAY, 1)).toBe(1);
    expect(await todayStore.addProtein(yangcho, DAY, 1)).toBe(2);
    expect(await todayStore.addProtein(yangcho, DAY, -1)).toBe(1);
    expect(await todayStore.addProtein(yangcho, DAY, -1)).toBe(0);
    expect(await todayStore.addProtein(yangcho, DAY, -1)).toBe(0);
    for (let i = 0; i < 25; i++) await todayStore.addProtein(towee, DAY, 1);
    expect((await db.query("SELECT servings FROM day_protein WHERE person_id = $1", [towee])).rows).toEqual([{ servings: 20 }]);
  });

  test("both of us see both counts; nobody counts for the other", async () => {
    await todayStore.addProtein(towee, DAY, 1);
    const day = await asPersonApp(yangcho, async (c) => todayStore.dayFor(c, await couple.loadCouple(c, yangcho), DAY));
    expect(day.towee.protein).toBe(1);
    expect(day.yangcho.protein).toBe(0);
    await expect(
      asPerson(db, yangcho, () =>
        db.query("INSERT INTO day_protein (person_id, day, servings) VALUES ($1, $2, 5)", [towee, DAY]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  test("is not News — no ping every time the other one eats an egg", async () => {
    await todayStore.addProtein(yangcho, DAY, 1);
    expect(await newsAs(towee)).toEqual([]);
  });
});

describe("콕 찌르기 (011)", () => {
  let poke: typeof import("@/lib/poke");
  beforeAll(async () => {
    poke = await import("@/lib/poke");
  });

  test("three a day, then it says so instead of a fourth", async () => {
    expect(await poke.sendPoke(yangcho, towee, DAY)).toBe(2);
    expect(await poke.sendPoke(yangcho, towee, DAY)).toBe(1);
    expect(await poke.sendPoke(yangcho, towee, DAY)).toBe(0);
    expect(await poke.sendPoke(yangcho, towee, DAY)).toBeNull();
    expect((await db.query("SELECT count(*)::int AS n FROM poke")).rows[0].n).toBe(3);
    // A new day, three more.
    expect(await poke.sendPoke(yangcho, towee, "2026-11-02")).toBe(2);
  });

  test("not yourself, and never as the other one", async () => {
    await expect(db.query("INSERT INTO poke (from_person, to_person, day) VALUES ($1, $1, $2)", [towee, DAY])).rejects.toThrow(/check/);
    await expect(
      asPerson(db, yangcho, () =>
        db.query("INSERT INTO poke (from_person, to_person, day) VALUES ($1, $2, $3)", [towee, yangcho, DAY]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  test("is News to the one poked, from the one who poked — and to nobody else", async () => {
    await poke.sendPoke(yangcho, towee, DAY);
    await poke.sendPoke(yangcho, towee, DAY);
    expect(await newsAs(towee)).toEqual([
      { kind: "poke", title: null, person_id: yangcho },
      { kind: "poke", title: null, person_id: yangcho },
    ]);
    expect(await newsAs(yangcho)).toEqual([]);
  });
});
