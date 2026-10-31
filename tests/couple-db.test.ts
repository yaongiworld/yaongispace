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
