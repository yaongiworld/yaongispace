import { describe, expect, it } from "vitest";
import { resolveCouple } from "../lib/couple";
import { CARDIO, CORE, KINDS, STRENGTH, STRENGTH_CATEGORIES, findExercise } from "../lib/workout/catalog";
import { parseWorkoutInput } from "../lib/workout/input";
import {
  KM_TENTH,
  KM_WHOLE,
  dgToWheels,
  formatKg,
  formatKm,
  isValidDistanceM,
  metersToWheels,
  wheelsToDg,
  wheelsToMeters,
} from "../lib/workout/measures";
import { ITEMS, newlyUnlocked, unlockedItems } from "../lib/workout/items";
import { byDay, weekSummary } from "../lib/workout/summary";
import type { Workout } from "../lib/workout/store";
import { gridRange, monthGrid, shiftMonth } from "../lib/moments/month";
import { addDays, isDay, relativeDayLabel, today, weekStart } from "../lib/today/day";
import { DEFAULT_LEAVE_MINUTE, LEAVE_MINUTES, clockLabel, isLeaveMinute } from "../lib/today/clock";
import { MOODS } from "../lib/today/moods";
import { ERAS } from "../lib/era/eras";
import { dailyWord } from "../lib/today/word";
import { hearthFor } from "../lib/mood";
import { catLine } from "../lib/today/line";
import type { NewsGroup } from "../lib/news";

/**
 * The couple app's rules that need no database: the catalogue the brief
 * fixes, the wheels' value grids, who is which cat, and the calendar maths.
 */

describe("the exercise catalogue (brief §4)", () => {
  it("has the four kinds, in order", () => {
    expect(KINDS.map((k) => k.id)).toEqual(["cardio", "strength", "core", "stretch"]);
  });

  it("keeps PR #1's seven cardio ids", () => {
    expect(CARDIO.map((c) => c.id)).toEqual([
      "treadmill_run",
      "treadmill_walk",
      "incline_walk",
      "indoor_bike",
      "outdoor_run",
      "outdoor_walk",
      "other",
    ]);
  });

  it("has 21 strength exercises: 상체 6 · 엉덩이 6 · 하체 5 · 등 4", () => {
    expect(STRENGTH).toHaveLength(21);
    const per = STRENGTH_CATEGORIES.map((c) => STRENGTH.filter((s) => s.category === c.id).length);
    expect(per).toEqual([6, 6, 5, 4]);
  });

  it("has the three core exercises", () => {
    expect(CORE.map((c) => c.label)).toEqual(["레그 레이즈", "크런치", "데드버그"]);
  });

  it("never reuses an id across kinds, so an id alone finds its exercise", () => {
    const ids = [...CARDIO, ...STRENGTH, ...CORE].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findExercise("hip_thrust")?.kind).toBe("strength");
  });
});

describe("the wheels (brief §9 유산소 거리 입력 방식)", () => {
  it("offer 0–49 and 0–9, so 49.9km is the most and 0.1km the grid", () => {
    expect(KM_WHOLE[0]).toBe(0);
    expect(KM_WHOLE.at(-1)).toBe(49);
    expect(KM_TENTH).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(wheelsToMeters(49, 9)).toBe(49_900);
    expect(wheelsToMeters(5, 2)).toBe(5_200);
  });

  it("round-trip metres exactly, with integer maths", () => {
    for (let m = 100; m <= 49_900; m += 100) {
      const [w, t] = metersToWheels(m);
      expect(wheelsToMeters(w, t)).toBe(m);
    }
    expect(formatKm(11_200)).toBe("11.2");
    expect(formatKm(3_000)).toBe("3.0");
  });

  it("treat 0.0km as nothing to save", () => {
    expect(isValidDistanceM(wheelsToMeters(0, 0))).toBe(false);
    expect(isValidDistanceM(100)).toBe(true);
  });

  it("weigh in half kilograms", () => {
    expect(wheelsToDg(22, 5)).toBe(225);
    expect(dgToWheels(225)).toEqual([22, 5]);
    expect(formatKg(225)).toBe("22.5");
    expect(formatKg(200)).toBe("20");
  });

  it("turn the leaving clock in 10 minutes from 17:30", () => {
    expect(clockLabel(DEFAULT_LEAVE_MINUTE)).toBe("17:30");
    expect(LEAVE_MINUTES).toHaveLength(144);
    expect(LEAVE_MINUTES.every((m) => m % 10 === 0)).toBe(true);
    expect(isLeaveMinute(1055)).toBe(false);
  });
});

describe("what a workout may carry (brief §9 남은 5가지-5)", () => {
  const base = { personId: "00000000-0000-0000-0000-000000000001", day: "2026-11-01" };

  it("accepts each kind with exactly its own fields", () => {
    expect(parseWorkoutInput({ ...base, kind: "cardio", exerciseId: "indoor_bike", distanceM: 8200, minutes: 30 })).not.toBeNull();
    expect(parseWorkoutInput({ ...base, kind: "strength", exerciseId: "hip_thrust", weightDg: 400 })).not.toBeNull();
    expect(parseWorkoutInput({ ...base, kind: "core", exerciseId: "crunch", reps: 20 })).not.toBeNull();
    expect(parseWorkoutInput({ ...base, kind: "stretch", exerciseId: "stretch" })).not.toBeNull();
  });

  it("refuses a strength exercise filed as cardio, off-grid distance, or a bad day", () => {
    expect(parseWorkoutInput({ ...base, kind: "cardio", exerciseId: "hip_thrust", distanceM: 1000, minutes: 10 })).toBeNull();
    expect(parseWorkoutInput({ ...base, kind: "cardio", exerciseId: "outdoor_run", distanceM: 1050, minutes: 10 })).toBeNull();
    expect(parseWorkoutInput({ ...base, kind: "strength", exerciseId: "rdl", weightDg: 223 })).toBeNull();
    expect(parseWorkoutInput({ ...base, day: "2026-02-30", kind: "stretch", exerciseId: "stretch" })).toBeNull();
  });
});

describe("who is which cat", () => {
  const rows = [
    { id: "a", display_name: "토위", cat: null },
    { id: "b", display_name: "양초", cat: null },
  ];

  it("puts 양초 left and 토위 right whoever is signed in", () => {
    const fromTowee = resolveCouple(rows, "a");
    expect(fromTowee.yangcho?.id).toBe("b");
    expect(fromTowee.towee?.id).toBe("a");
    expect(fromTowee.me.cat).toBe("towee");
    expect(fromTowee.partner?.cat).toBe("yangcho");
  });

  it("trusts person.cat over the display name", () => {
    const c = resolveCouple(
      [
        { id: "a", display_name: "Tony", cat: "towee" },
        { id: "b", display_name: "Gee", cat: "yangcho" },
      ],
      "b",
    );
    expect(c.me.cat).toBe("yangcho");
    // Named 양초 and 토위 in the UI, never by the Google profile (CLAUDE.md).
    expect(c.partner?.name).toBe("토위");
    expect(c.claimed).toBe(true);
  });

  it("knows when it is only guessing, so Today can ask once", () => {
    const guess = resolveCouple(
      [
        { id: "a", display_name: "Tony", cat: null },
        { id: "b", display_name: "Gee", cat: null },
      ],
      "b",
    );
    expect(guess.claimed).toBe(false);
    expect([guess.me.name, guess.partner?.name].sort()).toEqual(["양초", "토위"]);
  });

  it("still renders for the first of us alone", () => {
    const c = resolveCouple([{ id: "b", display_name: "양초", cat: null }], "b");
    expect(c.partner).toBeNull();
  });
});

describe("the cat's little items (brief §9 남은 5가지-3)", () => {
  it("are about twelve, opening one at a time", () => {
    expect(ITEMS).toHaveLength(12);
    const steps = ITEMS.map((i) => i.at);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    expect(new Set(steps).size).toBe(steps.length);
  });

  it("open on the workout that reaches the step, and only then", () => {
    expect(unlockedItems(0)).toEqual([]);
    expect(newlyUnlocked(0, 1)?.id).toBe("ribbon");
    expect(newlyUnlocked(1, 2)).toBeNull();
    expect(unlockedItems(12).map((i) => i.id)).toContain("cap");
  });
});

describe("days and months", () => {
  it("counts the Seoul day, not the server's", () => {
    // 2026-10-31 15:30 UTC is already 11월 1일 00:30 in Seoul.
    expect(today(new Date("2026-10-31T15:30:00Z"))).toBe("2026-11-01");
  });

  it("starts weeks on Monday", () => {
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // a Sunday
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
  });

  it("says 오늘 and 어제", () => {
    expect(relativeDayLabel("2026-11-01", "2026-11-01")).toBe("오늘");
    expect(relativeDayLabel("2026-10-31", "2026-11-01")).toBe("어제");
    expect(relativeDayLabel("2026-10-20", "2026-11-01")).toBe("10월 20일 (화)");
    expect(isDay("2026-13-01")).toBe(false);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("lays a month out in whole Monday-first weeks", () => {
    const g = monthGrid("2026-11");
    expect(g.every((row) => row.length === 7)).toBe(true);
    expect(g[0][0].day).toBe("2026-10-26");
    expect(g[0][6]).toEqual({ day: "2026-11-01", inMonth: true });
    expect(g.flat().filter((c) => c.inMonth)).toHaveLength(30);
    expect(gridRange("2026-11").to).toBe("2026-12-06");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("the Workout summary line", () => {
  const w = (day: string, kind: Workout["kind"], distanceM: number | null = null): Workout => ({
    id: `${day}-${kind}-${distanceM}`,
    personId: "p",
    enteredBy: "p",
    day,
    kind,
    exerciseId: "x",
    distanceM,
    minutes: null,
    weightDg: null,
    reps: null,
    createdAt: new Date(),
  });

  it("adds sessions, days and cardio kilometres — nothing to compare", () => {
    const s = weekSummary([w("2026-10-27", "cardio", 3000), w("2026-10-27", "strength"), w("2026-10-29", "cardio", 8200)]);
    expect(s).toEqual({ sessions: 3, cardioM: 11_200, days: 2 });
  });

  it("groups by day, newest first", () => {
    const g = byDay([w("2026-10-27", "core"), w("2026-10-29", "stretch"), w("2026-10-27", "cardio", 100)]);
    expect(g.map((d) => [d.day, d.workouts.length])).toEqual([
      ["2026-10-29", 1],
      ["2026-10-27", 2],
    ]);
  });
});

describe("the cat's line for the new News kinds (충돌 6)", () => {
  const group = (kind: string, title: string | null): NewsGroup => ({
    key: kind,
    by: "day",
    journeyTitle: null,
    arrivedAt: new Date(),
    items: [
      {
        entryId: "e",
        kind,
        sourceId: "s",
        title,
        text: "",
        personId: "p",
        personName: "토위",
        journeyId: null,
        journeyTitle: null,
        arrivedAt: new Date(),
        imminent: false,
        occursAt: null,
      },
    ],
  });

  it("speaks of a mood, a leaving time, and a workout written for you", () => {
    expect(hearthFor([group("mood", "happy")]).caption).toBe(`토위는 오늘 ${MOODS[0].emoji} ${MOODS[0].label}`);
    expect(hearthFor([group("offwork", "18:30")]).caption).toBe("토위는 18:30에 신도림역 도착이래요");
    expect(hearthFor([group("offwork", "left")]).caption).toBe("토위가 회사에서 나왔어요");
    expect(hearthFor([group("workout_for", "crunch")]).caption).toBe("토위가 기록해줬어요 💌");
    expect(hearthFor([group("poke", null)]).caption).toBe("토위가 콕 찔렀어요 👉");
    expect(hearthFor([group("miss", null)]).caption).toBe("토위가 보고싶대요 💗");
  });
});

describe("the Today cat's one line", () => {
  const now = new Date("2026-11-01T03:00:00Z"); // 12:00 in Seoul
  const g = (kind: string, at: string, title: string | null = null, imminent = false): NewsGroup => ({
    key: `${kind}-${at}`,
    by: kind === "letter" ? "alone" : "day",
    journeyTitle: null,
    arrivedAt: new Date(at),
    items: [
      {
        entryId: "e",
        kind,
        sourceId: "s",
        title,
        text: "",
        personId: "p",
        personName: "토위",
        journeyId: null,
        journeyTitle: null,
        arrivedAt: new Date(at),
        imminent,
        occursAt: null,
      },
    ],
  });

  it("never lets a mood push an unseen letter out", () => {
    const groups = [g("mood", "2026-11-01T02:55:00Z", "happy"), g("letter", "2026-11-01T02:50:00Z")];
    expect(catLine({ groups, seenAt: null, quietPartner: null, now })).toBe("토위가 편지를 봉했어요");
  });

  it("still tells you about last night's letter the next morning", () => {
    const groups = [g("letter", "2026-10-31T13:00:00Z")]; // 22:00 the day before, in Seoul
    expect(catLine({ groups, seenAt: new Date("2026-10-31T12:00:00Z"), quietPartner: "토위", now })).toBe(
      "토위가 편지를 봉했어요",
    );
  });

  it("lets a letter you have already seen give way", () => {
    const groups = [g("letter", "2026-10-31T13:00:00Z")];
    expect(catLine({ groups, seenAt: new Date("2026-10-31T14:00:00Z"), quietPartner: "토위", now })).toBe(
      "토위는 아직 바쁜가 봐요",
    );
  });

  it("puts a workout written for you before a clock change", () => {
    const groups = [g("offwork", "2026-11-01T02:59:00Z", "18:30"), g("workout_for", "2026-11-01T02:00:00Z", "crunch")];
    expect(catLine({ groups, seenAt: null, quietPartner: null, now })).toBe("토위가 기록해줬어요 💌");
  });

  it("cheers a day both of us moved, after an unseen letter", () => {
    const both = { moods: true, moved: true };
    expect(catLine({ groups: [], seenAt: null, quietPartner: null, together: both, now })).toBe("💪 오늘 둘 다 운동했어요!");
    const letter = [g("letter", "2026-11-01T02:00:00Z")];
    expect(catLine({ groups: letter, seenAt: null, quietPartner: null, together: both, now })).toBe("토위가 편지를 봉했어요");
  });

  it("says both pressed a face instead of half the story, but never hides real news", () => {
    const moods = { moods: true, moved: false };
    const mood = [g("mood", "2026-11-01T02:55:00Z", "happy")];
    expect(catLine({ groups: mood, seenAt: null, quietPartner: null, together: moods, now })).toBe("💞 오늘 둘 다 기분을 남겼어요");
    const left = [g("mood", "2026-11-01T02:55:00Z", "happy"), g("offwork", "2026-11-01T02:50:00Z", "left")];
    expect(catLine({ groups: left, seenAt: null, quietPartner: null, together: moods, now })).toBe("토위가 회사에서 나왔어요");
  });

  it("is the warm nothing on a quiet day", () => {
    expect(catLine({ groups: [], seenAt: null, quietPartner: null, now })).toBe("조용한 하루예요");
  });
});

describe("Era", () => {
  it("lists South America only — no locked era promised (PO, 2026-11-01)", () => {
    expect(ERAS.map((e) => [e.id, e.open])).toEqual([["south_america", true]]);
  });
});

describe("the cat wears today's mood", () => {
  it("has a cat face for every mood, and 🐱 before one is pressed", async () => {
    const { catFace } = await import("../lib/today/moods");
    expect(MOODS.map((m) => catFace(m.id))).toEqual(["😸", "😻", "😽", "🙀", "😿", "😾"]);
    expect(catFace(null)).toBe("🐱");
  });
});

describe("오늘의 한마디", () => {
  it("is the same for both of us on a day, and changes across days", () => {
    expect(dailyWord("2026-11-03")).toBe(dailyWord("2026-11-03"));
    const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"].map((d) => dailyWord(d));
    expect(new Set(week).size).toBeGreaterThan(3);
  });

  it("notices when the next trail is close, and only then", () => {
    expect(dailyWord("2026-11-03", { label: "마추픽추", leftM: 1200 })).toBe("마추픽추까지 1.2km! 거의 다 왔어요 🏔️");
    expect(dailyWord("2026-11-03", { label: "마추픽추", leftM: 5000 })).not.toContain("마추픽추");
  });
});
