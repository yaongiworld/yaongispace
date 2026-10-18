import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Client, Pool } from "pg";
import { TEST_DATABASE_URL, asPerson, migrate } from "./db";
import { reset, twoPeople } from "./world";

/**
 * The South America planner's data layer, against the real database.
 *
 * What is worth proving here is not the planning rules (tests/south-america/
 * covers those as pure functions) but the three things only Postgres can
 * decide: that two people editing the same day are serialised and the second
 * sees the first, that anyone who is not one of the two members sees nothing,
 * and that a retried save is one record.
 */

let db: Client;
let towee: string;
let yangcho: string;
let store: typeof import("@/lib/south-america/server/store");

beforeAll(async () => {
  db = await migrate();
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  store = await import("@/lib/south-america/server/store");
});

afterAll(async () => {
  await db?.end();
  const g = globalThis as unknown as { yaongiPool?: Pool };
  await g.yaongiPool?.end();
  g.yaongiPool = undefined;
});

beforeEach(async () => {
  await reset(db);
  ({ towee, yangcho } = await twoPeople(db));
  await db.query("insert into sa_member (person_id, persona) values ($1, 'tawi'), ($2, 'yangcho')", [towee, yangcho]);
});

// 2036-01-02 15:00 KST — a plan day that starts on 2036-01-02
const NOON = new Date("2036-01-02T06:00:00Z");
const EVENING = new Date("2036-01-02T09:30:00Z"); // 18:30 KST
const TODAY = "2036-01-02";

const rowCount = async (table: string) => Number((await db.query(`select count(*) n from ${table}`)).rows[0].n);

test("the migration binds the two seeded names to their personas, once", async () => {
  // twoPeople ran after the migration, so replay the backfill statement by hand
  await db.query("truncate sa_member");
  await db.query(`insert into sa_member (person_id, persona)
    select id, case display_name when '토위' then 'tawi' when '양초' then 'yangcho' end
      from person where display_name in ('토위', '양초') on conflict do nothing`);
  expect(await rowCount("sa_member")).toBe(2);
});

test("a member's first read creates today and returns it", async () => {
  const snap = await store.getSnapshot(yangcho, NOON);
  expect(snap?.persona).toBe("yangcho");
  expect(snap?.today).toBe(TODAY);
  expect(snap?.days.map((d) => d.day)).toEqual([TODAY]);
  expect((await store.getSnapshot(towee, NOON))?.persona).toBe("tawi");
});

test("04:00 boundary: 03:00 Seoul still belongs to the day before", async () => {
  const snap = await store.getSnapshot(yangcho, new Date("2036-01-01T18:00:00Z")); // 03:00 KST on the 2nd
  expect(snap?.today).toBe("2036-01-01");
});

test("someone who is not a member is turned away and sees nothing", async () => {
  const { rows } = await db.query<{ id: string }>("insert into person (display_name) values ('손님') returning id");
  const guest = rows[0].id;
  expect(await store.getSnapshot(guest, NOON)).toBeNull();
  expect(await store.runDayCommand(guest, { kind: "plan.set", plan: "B" }, NOON)).toEqual({ ok: false, reason: "not_member" });
  // the wall holds even when the query is written anyway
  const direct = await asPerson(db, guest, async () => (await db.query("select count(*)::int n from sa_day")).rows[0].n);
  expect(direct).toBe(0);
});

test("unknown commands are refused before they touch anything", async () => {
  expect(await store.runDayCommand(yangcho, { kind: "drop.everything" }, NOON)).toEqual({ ok: false, reason: "bad_command" });
  expect(await store.runDayCommand(yangcho, { kind: "eta.field", person: "someone", reference: "home", time: 1 }, NOON)).toEqual({ ok: false, reason: "bad_command" });
});

test("the other phone sees what one phone did, and who did it comes from the login, not the request", async () => {
  const r = await store.runDayCommand(yangcho, { kind: "eta.field", person: "yangcho", reference: "home_arrival", time: 19 * 60 + 10 }, NOON);
  expect(r).toMatchObject({ ok: true, changed: true, version: 2, day: TODAY });
  const seenByTawi = await store.getSnapshot(towee, NOON);
  const today = seenByTawi!.days[0];
  expect(today.version).toBe(2);
  expect(JSON.stringify(today.state.eta.yangcho)).toContain("1150");
  const { rows } = await db.query("select persona, target, version from sa_change");
  expect(rows).toEqual([{ persona: "yangcho", target: `day:${TODAY}`, version: 2 }]);
});

test("two people pressing ❤️ at the same instant: one lock, one winner, nothing lost", async () => {
  const [a, b] = await Promise.all([
    store.runDayCommand(yangcho, { kind: "heart", now: 1150 }, EVENING),
    store.runDayCommand(towee, { kind: "heart", now: 1151 }, EVENING),
  ]);
  const oks = [a, b].filter((r) => r.ok);
  expect(oks.length).toBe(2); // the second press is a no-op on the same session, not an error
  expect([a, b].filter((r) => r.ok && r.changed).length).toBe(1); // but only one of them changed anything
  const { rows } = await db.query("select version from sa_day where day = $1", [TODAY]);
  expect(rows[0].version).toBe(2);
});

test("a rule violation after the heart is refused: the plan is locked", async () => {
  await store.runDayCommand(yangcho, { kind: "heart", now: 1150 }, EVENING);
  const r = await store.runDayCommand(towee, { kind: "plan.set", plan: "B", homePerson: "tawi" }, EVENING);
  expect(r).toEqual({ ok: false, reason: "locked" });
  const { rows } = await db.query("select version from sa_day where day = $1", [TODAY]);
  expect(rows[0].version).toBe(2); // the refused command did not bump it
});

test("each person's workout completion is their own, and both together complete the session", async () => {
  await store.runDayCommand(yangcho, { kind: "heart", now: 1100 }, EVENING);
  const later = new Date("2036-01-02T11:30:00Z"); // 20:30 KST
  expect(await store.runDayCommand(yangcho, { kind: "workout.complete", person: "yangcho", actualAt: 1215 }, later)).toMatchObject({ ok: true, changed: true });
  expect(await store.runDayCommand(towee, { kind: "workout.complete", person: "tawi", actualAt: 1220 }, later)).toMatchObject({ ok: true, changed: true });
  const { workoutSession } = await import("@/lib/south-america/domain/day/workout");
  const snap = await store.getSnapshot(yangcho, later);
  expect(workoutSession(snap!.days[0].state).status).toBe("complete");
});

test("a new day carries the settings over but starts with a clean slate", async () => {
  await store.runDayCommand(yangcho, { kind: "setting.set", person: "yangcho", key: "shower", value: 20 }, NOON);
  await store.runDayCommand(yangcho, { kind: "eta.field", person: "yangcho", reference: "home_arrival", time: 1100 }, NOON);
  const nextDay = new Date("2036-01-03T06:00:00Z");
  const snap = await store.getSnapshot(towee, nextDay);
  expect(snap!.days.map((d) => d.day)).toEqual(["2036-01-03", TODAY]); // yesterday is kept, never replaced
  expect(snap!.days[0].state.settings.yangcho.shower).toBe(20);
  // yesterday's typed-in arrival does not carry over; only the planner's own defaults are there
  expect(snap!.days[0].state.eta.yangcho.every((e) => e.source === "default")).toBe(true);
  expect(snap!.days[1].state.eta.yangcho.some((e) => e.source === "self")).toBe(true);
});

test("cardio: recording the same log twice is one row; an edit keeps the original in history", async () => {
  const input = { logId: "log-1", person: "yangcho" as const, exerciseId: "treadmill_run", minutes: 30, distanceM: 4200, day: TODAY };
  expect(await store.runLogCommand(yangcho, { kind: "log.record", input }, EVENING)).toMatchObject({ ok: true, changed: true, version: 1 });
  expect(await store.runLogCommand(yangcho, { kind: "log.record", input }, EVENING)).toMatchObject({ ok: true, changed: false });
  expect(await rowCount("sa_log")).toBe(1);

  expect(await store.runLogCommand(towee, { kind: "log.edit", logId: "log-1", patch: { distanceM: 4300 } }, EVENING)).toMatchObject({ ok: true, changed: true, version: 2 });
  const snap = await store.getSnapshot(yangcho, EVENING);
  const log = snap!.logs[0] as { distanceM: number; revisions: { kind: string }[] };
  expect(log.distanceM).toBe(4300);
  expect(log.revisions.map((r) => r.kind)).toEqual(["recorded", "edited"]);

  await store.runLogCommand(yangcho, { kind: "log.cancel", logId: "log-1" }, EVENING);
  expect(await rowCount("sa_log")).toBe(1); // cancelled, never deleted
});

test("cardio: a retried save that raced the first one is still one record", async () => {
  const input = { logId: "race-1", person: "tawi" as const, exerciseId: "outdoor_walk", minutes: 20, distanceM: 1500, day: TODAY };
  const results = await Promise.all([
    store.runLogCommand(towee, { kind: "log.record", input }, EVENING),
    store.runLogCommand(towee, { kind: "log.record", input }, EVENING),
  ]);
  expect(results.every((r) => r.ok)).toBe(true);
  expect(await rowCount("sa_log")).toBe(1);
});

test("the app role cannot delete anything or rewrite the ledger", async () => {
  await store.runDayCommand(yangcho, { kind: "recalc", now: 900 }, NOON);
  await expect(asPerson(db, yangcho, () => db.query("delete from sa_day"))).rejects.toThrow(/permission denied/);
  await expect(asPerson(db, yangcho, () => db.query("update sa_change set persona = 'tawi'"))).rejects.toThrow(/permission denied/);
  await expect(asPerson(db, yangcho, () => db.query("delete from sa_change"))).rejects.toThrow(/permission denied/);
  // and cannot sign a change as the other person
  await expect(
    asPerson(db, yangcho, () => db.query("insert into sa_change (person_id, persona, target, command, version) values ($1, 'tawi', 'x', '{}', 1)", [towee])),
  ).rejects.toThrow(/row-level security/);
});
