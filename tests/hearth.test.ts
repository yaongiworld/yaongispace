import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { collapse, type NewsItem } from "@/lib/news";
import { MOOD_ASSET, hearthFor } from "@/lib/mood";

const repoRoot = join(__dirname, "..");

/**
 * The hearth: how the feed collapses into lines, and what face the cat wears.
 *
 * Pure functions over shaped data, so these are plain unit tests — the
 * database half of News lives in `news.test.ts` against real Postgres. What is
 * worth asserting here is the shape of the collapse (a Letter never joins
 * anything) and the rule that keeps the cat honest (its mood comes from the
 * same item the caption does).
 */

let n = 0;
function item(over: Partial<NewsItem> = {}): NewsItem {
  n += 1;
  return {
    entryId: `entry-${n}`,
    kind: "photo",
    sourceId: `source-${n}`,
    title: null,
    text: "",
    personId: "yangcho",
    personName: "양초",
    journeyId: null,
    journeyTitle: null,
    arrivedAt: new Date("2026-08-22T05:00:00Z"),
    imminent: false,
    occursAt: null,
    ...over,
  };
}

describe("collapsing the feed", () => {
  it("collapses a day's photos into one line", () => {
    // Seven photos from one afternoon are one line, not seven. Without this
    // the hearth becomes a scroll, which is the dashboard it is not.
    const groups = collapse([item(), item(), item()]);
    expect(groups).toHaveLength(1);
    expect(groups[0].by).toBe("day");
    expect(groups[0].items).toHaveLength(3);
  });

  it("collapses by Journey where one exists, in preference to the day", () => {
    // A Journey spans days, so its photos are one line even across them.
    const groups = collapse([
      item({ journeyId: "j1", journeyTitle: "제주, 10월", arrivedAt: new Date("2026-08-22T05:00:00Z") }),
      item({ journeyId: "j1", journeyTitle: "제주, 10월", arrivedAt: new Date("2026-08-21T05:00:00Z") }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].by).toBe("journey");
    expect(groups[0].journeyTitle).toBe("제주, 10월");
  });

  it("keeps separate days apart", () => {
    const groups = collapse([
      item({ arrivedAt: new Date("2026-08-22T05:00:00Z") }),
      item({ arrivedAt: new Date("2026-08-20T05:00:00Z") }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("groups a day in Seoul, not in the server's zone", () => {
    // 15:30 and 16:30 UTC are both the evening of the 22nd in Seoul. A server
    // grouping in UTC would split them across two days and show two lines for
    // one evening.
    const groups = collapse([
      item({ arrivedAt: new Date("2026-08-22T16:30:00Z") }),
      item({ arrivedAt: new Date("2026-08-22T15:30:00Z") }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it("never groups a Letter, even two on one day", () => {
    // The rule most likely to be "tidied" later by grouping uniformly. Two
    // letters are two lines: a letter is the one piece of news always worth
    // its own sentence, and "편지 2통" would flatten what the app is for.
    const groups = collapse([
      item({ kind: "letter", sourceId: "l1" }),
      item({ kind: "letter", sourceId: "l2" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.by === "alone")).toBe(true);
  });

  it("never groups a Letter into a Journey either", () => {
    const groups = collapse([
      item({ kind: "letter", sourceId: "l1", journeyId: "j1", journeyTitle: "제주" }),
      item({ kind: "letter", sourceId: "l2", journeyId: "j1", journeyTitle: "제주" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].journeyTitle).toBeNull();
  });

  it("keeps different kinds on one day apart", () => {
    // A photo and a visit on one afternoon are different sentences.
    const groups = collapse([item({ kind: "photo" }), item({ kind: "visit" })]);
    expect(groups).toHaveLength(2);
  });

  it("orders lines by arrival, newest first", () => {
    const groups = collapse([
      item({ kind: "letter", sourceId: "old", arrivedAt: new Date("2026-08-20T05:00:00Z") }),
      item({ kind: "letter", sourceId: "new", arrivedAt: new Date("2026-08-22T05:00:00Z") }),
    ]);
    expect(groups.map((g) => g.items[0].sourceId)).toEqual(["new", "old"]);
  });
});

describe("the cat's mood", () => {
  const noon = new Date("2026-08-22T03:00:00Z"); // 12:00 in Seoul
  const night = new Date("2026-08-22T17:00:00Z"); // 02:00 in Seoul

  it("mirrors the top News item rather than the clock", () => {
    // The acceptance criterion: cat and caption cannot contradict. A letter at
    // 2am still gets the letter face — if the hour won here, the cat would
    // yawn over "편지를 봉했어요".
    const hearth = hearthFor(collapse([item({ kind: "letter" })]), night);
    expect(hearth.mood).toBe("loving");
    expect(hearth.caption).toContain("편지");
  });

  it("takes its caption from the same item as its face", () => {
    // Both come from one decision, so there is no way for them to disagree.
    const groups = collapse([item({ kind: "letter", sourceId: "l1" })]);
    const hearth = hearthFor(groups, noon);
    expect(hearth.source?.items[0].sourceId).toBe("l1");
  });

  it("looks forward to an imminent Event", () => {
    const hearth = hearthFor(
      collapse([item({ kind: "event", imminent: true, title: "결혼기념일" })]),
      noon,
    );
    expect(hearth.mood).toBe("expectant");
    expect(hearth.caption).toContain("다가와요");
  });

  it("is delighted by photos", () => {
    const hearth = hearthFor(collapse([item(), item()]), noon);
    expect(hearth.mood).toBe("delighted");
    expect(hearth.caption).toBe("양초가 사진 2장을 올렸어요");
  });

  it("names the Journey when there is one", () => {
    const hearth = hearthFor(
      collapse([item({ journeyId: "j1", journeyTitle: "제주, 10월" })]),
      noon,
    );
    expect(hearth.caption).toBe("양초가 제주, 10월에 사진 1장을 올렸어요");
  });

  it("says 봉했어요 of a Letter, never 보냈어요", () => {
    // The verb is sealing. Nothing is transmitted — both letters live in the
    // same archive and always did.
    const hearth = hearthFor(collapse([item({ kind: "letter" })]), noon);
    expect(hearth.caption).toContain("봉했어요");
    expect(hearth.caption).not.toContain("보냈");
  });
});

describe("a quiet day", () => {
  const noon = new Date("2026-08-22T03:00:00Z");
  const night = new Date("2026-08-22T17:00:00Z");

  it("is a warm nothing, never silence", () => {
    const hearth = hearthFor([], noon);
    expect(hearth.caption).toBe("조용한 하루예요");
    expect(hearth.source).toBeNull();
  });

  it("is never a prompt", () => {
    // "편지를 써보세요" is a nag, and a home screen that nags is one you stop
    // opening. A quiet day is a state of a real life, not a call to action.
    const hearth = hearthFor([], noon);
    for (const nag of ["보세요", "해보", "하세요", "?", "!"]) {
      expect(hearth.caption).not.toContain(nag);
    }
  });

  it("falls back to the hour only when there is no News to mirror", () => {
    // The fallback is safe here precisely because there is nothing it can
    // contradict.
    expect(hearthFor([], noon).mood).toBe("content");
    expect(hearthFor([], night).mood).toBe("sleepy");
  });
});

describe("the interim cat", () => {
  it("ships a drawing for every mood", () => {
    // The mood vocabulary is what survives the commission; the drawings are
    // the placeholder. A mood whose file was never copied into `public` would
    // render a broken image on the one screen the app opens to.
    for (const src of Object.values(MOOD_ASSET)) {
      expect(src.startsWith("/yaongi/")).toBe(true);
      expect(existsSync(join(repoRoot, "public", src))).toBe(true);
    }
  });

  it("carries the licence the assets are used under", () => {
    // A licence rides along with the asset, as it does for the fonts and the
    // icons. These are MIT (Fluent Emoji) — no third-party character IP, or
    // the app could not be shown in Yangcho's MBA portfolio.
    const licence = readFileSync(
      join(repoRoot, "public/yaongi/LICENSE-fluent-emoji.txt"),
      "utf8",
    );
    expect(licence).toContain("MIT License");
    // Stated as a placeholder, explicitly, so nobody mistakes it for the cat.
    expect(licence).toContain("PLACEHOLDER");
  });

  it("uses distinct faces, so the moods are visibly different", () => {
    const used = Object.values(MOOD_ASSET);
    expect(new Set(used).size).toBe(used.length);
  });
});
