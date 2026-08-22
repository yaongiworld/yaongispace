import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { koreanDate, koreanRelative } from "@/lib/korean-date";

/**
 * The parts of the section that rot quietly.
 *
 * A wrong timezone, a font file nobody shipped, or 보내기 creeping back into
 * the copy are all things that keep building, keep passing every other test,
 * and are wrong in a way you only notice by looking. These are cheap to assert
 * from node and there is no honest way to assert them by rendering — the seal
 * itself is tested against the database in `letters.test.ts` and
 * `letters-lib.test.ts`, which is where the behaviour actually lives.
 */

const repoRoot = join(__dirname, "..");
const lettersDir = join(repoRoot, "app", "letters");

/**
 * The code with its comments taken out.
 *
 * These files talk about the words they must not use — "봉하기, never 보내기"
 * is a comment worth keeping, and a plain substring search over the file would
 * read it as the mistake it is warning against. So the assertions below run
 * over what actually ships.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

describe("dates, the way we say them", () => {
  it("writes a date in Korean convention", () => {
    // 2026-08-22T05:00:00Z is 14:00 on the 22nd in Seoul.
    expect(koreanDate(new Date("2026-08-22T05:00:00Z"))).toBe("2026년 8월 22일");
  });

  it("reasons in Asia/Seoul, not in the server's zone", () => {
    // 15:30 UTC on the 21st is 00:30 on the 22nd in Seoul. A server rendering
    // in UTC would call this the 21st — yesterday's letter, dated wrong, in an
    // archive meant to last decades.
    expect(koreanDate(new Date("2026-08-21T15:30:00Z"))).toBe("2026년 8월 22일");
  });

  it("is relative for the recent past and a date beyond that", () => {
    const now = new Date("2026-08-22T05:00:00Z");
    const ago = (ms: number) => new Date(now.getTime() - ms);
    const day = 24 * 60 * 60 * 1000;

    expect(koreanRelative(ago(30_000), now)).toBe("방금");
    expect(koreanRelative(ago(5 * 60_000), now)).toBe("5분 전");
    expect(koreanRelative(ago(3 * 60 * 60_000), now)).toBe("3시간 전");
    expect(koreanRelative(ago(day), now)).toBe("어제");
    expect(koreanRelative(ago(3 * day), now)).toBe("3일 전");
    // Past a week it is a date: "37일 전" is arithmetic, not memory.
    expect(koreanRelative(ago(37 * day), now)).toBe("2026년 7월 16일");
  });
});

describe("the body face", () => {
  it("ships Gaegu and its OFL licence, as the other faces do", () => {
    // ADR-0007: Korean faces are self-hosted, and a licence rides along.
    expect(existsSync(join(repoRoot, "public/fonts/Gaegu-Regular.subset.woff2"))).toBe(
      true,
    );
    const licence = readFileSync(join(repoRoot, "public/fonts/OFL-Gaegu.txt"), "utf8");
    expect(licence).toContain("SIL Open Font License");
    expect(licence).toContain("Gaegu");
  });

  it("loads it with next/font/local, never next/font/google", () => {
    // `next/font/google` silently drops CJK subsets and renders tofu. The
    // failure is not a build error, which is exactly why this is asserted.
    //
    // Checked against the imports rather than the whole file: fonts.ts
    // *explains* why the Google loader is not used, and a plain substring
    // search cannot tell the explanation from the mistake.
    const fonts = stripComments(readFileSync(join(repoRoot, "app/fonts.ts"), "utf8"));
    expect(fonts).toContain("Gaegu-Regular.subset.woff2");
    expect(fonts).toContain('from "next/font/local"');
    expect(fonts).not.toContain("next/font/google");
  });

  it("is what a Letter's body is set in", () => {
    const css = readFileSync(join(repoRoot, "app/globals.css"), "utf8");
    expect(css).toContain("--font-letter");
    // Pretendard behind Gaegu: it carries only the common syllables, so a
    // rare one must seam rather than render as a box.
    expect(css).toMatch(/--font-letter:.*--font-gaegu.*--font-pretendard/s);

    const letterPage = readFileSync(join(lettersDir, "[id]", "page.tsx"), "utf8");
    expect(letterPage).toContain("var(--font-letter)");
  });
});

describe("the verb is 봉하기", () => {
  const sources = [
    join(lettersDir, "page.tsx"),
    join(lettersDir, "write", "page.tsx"),
    join(lettersDir, "LetterForm.tsx"),
    join(lettersDir, "actions.ts"),
    join(lettersDir, "[id]", "page.tsx"),
    join(lettersDir, "[id]", "edit", "page.tsx"),
  ];

  it("never says 보내기 in anything it renders", () => {
    // Sealing is the ceremony, and this is a decision rather than a
    // preference — 보내기 would make it a chat message with extra steps.
    for (const file of sources) {
      const text = stripComments(readFileSync(file, "utf8"));
      expect(text, file).not.toContain("보내기");
      expect(text, file).not.toContain("보냈");
      expect(text, file).not.toContain("보낸");
    }
  });

  it("says 봉하기 where the letter is finished", () => {
    expect(readFileSync(join(lettersDir, "write", "page.tsx"), "utf8")).toContain(
      "봉하기",
    );
  });

  it("shows no countdown for a sealed Letter", () => {
    // A countdown, a lock icon or "1통이 기다리고 있어요" would leak exactly
    // what the seal protects. The letterbox may not mention a letter it was
    // not given.
    const letterbox = stripComments(readFileSync(join(lettersDir, "page.tsx"), "utf8"));
    for (const leak of ["남았", "잠긴", "기다리", "곧 열", "D-"]) {
      expect(letterbox, leak).not.toContain(leak);
    }
  });
});

describe("only opening a Letter seals it", () => {
  it("the letterbox lists Letters without opening any", () => {
    const letterbox = stripComments(readFileSync(join(lettersDir, "page.tsx"), "utf8"));
    expect(letterbox).not.toContain("openLetter");
  });

  it("the edit page reads without opening, so an author cannot lock their own letter", () => {
    const edit = stripComments(
      readFileSync(join(lettersDir, "[id]", "edit", "page.tsx"), "utf8"),
    );
    expect(edit).toContain("letterFor");
    expect(edit).not.toContain("openLetter");
  });

  it("the letter page is the one place that opens one", () => {
    const page = stripComments(
      readFileSync(join(lettersDir, "[id]", "page.tsx"), "utf8"),
    );
    expect(page).toContain("openLetter");
  });
});
