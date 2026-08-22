import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The parts of the hearth that rot quietly.
 *
 * A shortcut grid creeping back, the cat gaining a link, WebGL arriving by way
 * of a dependency, or a nag appearing in the quiet-day copy are all things
 * that keep building, keep passing every behavioural test, and are wrong in a
 * way you only notice by looking at the page — by which time the decision has
 * been silently reversed. These are cheap to assert from node.
 *
 * The behaviour itself is tested elsewhere: `news.test.ts` against real
 * Postgres, `hearth.test.ts` over the pure functions.
 */

const repoRoot = join(__dirname, "..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf8");

/**
 * The code with its comments taken out.
 *
 * These files talk about the things they must not do — "no shortcut grid" is a
 * comment worth keeping, and a plain substring search would read it as the
 * mistake it warns against. So the assertions run over what ships.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

describe("the cat", () => {
  const cat = stripComments(read("app/Yaongi.tsx"));

  it("navigates nowhere", () => {
    // Tap is a squash-and-sparkle and nothing more. A cat that opened
    // something would make the hearth a launcher — which is the dashboard this
    // page is explicitly not.
    expect(cat).not.toContain("next/link");
    expect(cat).not.toContain("<Link");
    expect(cat).not.toContain("useRouter");
    expect(cat).not.toContain("href");
  });

  it("is CSS 3D, never WebGL", () => {
    // ADR-0008, measured: ~600KB and a warmer battery for a difference
    // invisible at 132px. The liveliness is in the reaction, not the render.
    for (const banned of ["three", "WebGL", "canvas", "getContext"]) {
      expect(cat).not.toContain(banned);
    }
    // The perspective is what makes the bob a tilt rather than a bounce.
    expect(cat).toContain("perspective");
  });

  it("has its motion in CSS, degrading to a still image", () => {
    const css = read("app/globals.css");
    expect(css).toContain("yaongi-bob");
    expect(css).toContain("rotateY");
    // ADR-0008 lists reduced-motion degradation as a reason this approach won.
    expect(css).toContain("prefers-reduced-motion");
  });
});

describe("the hearth", () => {
  const home = stripComments(read("app/page.tsx"));

  it("has no shortcut grid", () => {
    // Dropped because it duplicated the tab bar, and dropping it is what freed
    // the sixth tab slot for the calendar. The tab bar navigates; home does
    // not. A grid of links here would rebuild it by another name.
    expect(home).not.toContain("next/link");
    expect(home).not.toContain("<Link");
    expect(home).not.toContain("grid-cols");
  });

  it("never seals a Letter", () => {
    // The acceptance criterion. Only opening a Letter seals it; a read Letter
    // is immutable, so a home page that sealed on sight would permanently lock
    // letters their author could still have fixed.
    expect(home).not.toContain("open_letter");
    expect(home).not.toContain("openLetter");
    expect(home).not.toContain("read_at");
    expect(stripComments(read("lib/news.ts"))).not.toContain("open_letter");
    expect(stripComments(read("lib/news.ts"))).not.toContain("read_at");
  });

  it("reads News as the signed-in Person", () => {
    // Query as the owner and every seal in the archive is bypassed. This is
    // the single most important correctness constraint in the section.
    const news = read("lib/news.ts");
    expect(news).toContain("SET LOCAL ROLE yaongi_signed_in");
    expect(news).toContain("request.jwt.claims");
  });

  it("orders by arrival, the one place that does not use occurred_at", () => {
    const news = read("lib/news.ts");
    expect(news).toContain("arrived_at");
    // Reading `event.occurred_at` for News is the specific trap: a 2016
    // anniversary is news in 2026 and that is invisible from the stored row.
    expect(stripComments(news)).not.toContain("occurred_at");
  });
});

describe("the quiet day", () => {
  const mood = read("lib/mood.ts");

  it("is a warm nothing, in Korean, hardcoded", () => {
    expect(mood).toContain("조용한 하루");
  });

  it("carries no i18n scaffolding", () => {
    // The app speaks Korean, hardcoded — no switcher, no locale files.
    // `Intl` itself is fine and used deliberately: pinning Asia/Seoul is not
    // internationalisation, it is the opposite of it.
    for (const banned of ["useTranslation", "i18next", "formatMessage", "locale:"]) {
      expect(stripComments(mood)).not.toContain(banned);
    }
  });
});
