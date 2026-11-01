import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../app/manifest";
import { SECTIONS, VISIBLE_SECTIONS } from "../app/sections";

/**
 * Tests for the tab shell and the PWA manifest (ticket 04).
 *
 * These run in the existing `environment: "node"` and touch no database — the
 * repo's Postgres harness is untouched and still the seam for anything with a
 * schema behind it.
 *
 * What is deliberately *not* tested here: how the tab bar looks, and whether
 * the app actually installs. Rendering `TabBar` would need jsdom, a router mock
 * and `next/link` stubbing, and having paid for all that the assertion would be
 * "it rendered five links" — which is what `VISIBLE_SECTIONS` already tells us.
 * Installability is a property of a real browser on a real phone and cannot be
 * honestly asserted in vitest; it was verified by hand instead (see the ticket
 * report).
 *
 * What *is* worth testing is the stuff that silently rots: a manifest that
 * claims an icon file nobody shipped, a tab pointing at a route that does not
 * exist, or the manifest and the tab bar drifting apart. All three are real,
 * all three are quiet failures, and all three are honestly checkable from node.
 */

const repoRoot = join(__dirname, "..");
const appDir = join(repoRoot, "app");
const publicDir = join(repoRoot, "public");

/** The five tabs of the couple app (brief §3, 충돌 3), in tab order. */
const EXPECTED_TABS = [
  { id: "home", href: "/", label: "Today" },
  { id: "workout", href: "/workout", label: "Workout" },
  { id: "era", href: "/era", label: "Era" },
  { id: "moments", href: "/moments", label: "Moments" },
  { id: "letters", href: "/letters", label: "Letters" },
];

/** Hidden from the bar, kept in the code — and switchable back with one line. */
const EXPECTED_HIDDEN = ["photos", "map", "calendar", "recall"];

describe("the sections", () => {
  it("shows exactly the five tabs, in order, with their English labels", () => {
    expect(
      VISIBLE_SECTIONS.map(({ id, href, label }) => ({ id, href, label })),
    ).toEqual(EXPECTED_TABS);
  });

  it("keeps the old sections, hidden rather than deleted", () => {
    expect(SECTIONS.filter((s) => s.hidden).map((s) => s.id)).toEqual(
      EXPECTED_HIDDEN,
    );
  });

  it("every section, hidden or not, points at a route that exists", () => {
    // A hidden section still has to be one line away from coming back, which
    // it is not if its page has quietly been deleted.
    for (const section of SECTIONS) {
      // "/" is app/page.tsx; "/letters" is app/letters/page.tsx.
      const pagePath =
        section.href === "/"
          ? join(appDir, "page.tsx")
          : join(appDir, section.href.replace(/^\//, ""), "page.tsx");

      expect(existsSync(pagePath), `${section.href} has no page.tsx`).toBe(true);
    }
  });

  it("tab labels are single English words — fixed text, not a language switch", () => {
    for (const section of VISIBLE_SECTIONS) {
      expect(section.label, section.id).toMatch(/^[A-Z][a-z]+$/);
    }
  });

  it("has no duplicate routes or ids", () => {
    expect(new Set(SECTIONS.map((s) => s.href)).size).toBe(SECTIONS.length);
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
  });
});

describe("the PWA manifest", () => {
  const m = manifest();

  it("declares standalone display, so it launches without browser chrome", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
  });

  it("declares a Korean name and language", () => {
    expect(m.lang).toBe("ko");
    expect(m.name).toBe("야옹이월드");
    expect(m.short_name).toBe("야옹이월드");
  });

  it("ships every icon file it claims, at the size it claims", () => {
    expect(m.icons?.length).toBeGreaterThan(0);

    for (const icon of m.icons ?? []) {
      const file = join(publicDir, icon.src!.replace(/^\//, ""));
      expect(existsSync(file), `${icon.src} is declared but not shipped`).toBe(
        true,
      );

      // Read the real pixel dimensions out of the PNG's IHDR chunk rather than
      // trusting the `sizes` string. A manifest that claims 512x512 and ships a
      // 192x192 file installs a blurry icon and reports no error anywhere.
      const [declaredW, declaredH] = icon.sizes!.split("x").map(Number);
      const { width, height } = pngSize(file);
      expect(width, `${icon.src} width`).toBe(declaredW);
      expect(height, `${icon.src} height`).toBe(declaredH);
    }
  });

  it("offers a maskable icon, so Android does not letterbox it", () => {
    const purposes = (m.icons ?? []).map((i) => i.purpose);
    expect(purposes).toContain("maskable");
    expect(purposes).toContain("any");
  });

  it("declares a shortcut per visible tab except home", () => {
    // Home is what tapping the icon already does; a shortcut to it would be a
    // shortcut to where you already are. Hidden sections get none — a
    // long-press menu is just another way to see a tab.
    const shortcutUrls = (m.shortcuts ?? []).map((s) => s.url);
    expect(shortcutUrls).toEqual(
      VISIBLE_SECTIONS.filter((s) => s.id !== "home").map((s) => s.href),
    );
  });

  it("uses the Soft Clay dawn peach as its theme and splash colour", () => {
    // Must match `themeColor` in app/layout.tsx's viewport export, or the
    // Android status bar will not match the top of the page gradient.
    expect(m.theme_color).toBe("#fff4e9");
    expect(m.background_color).toBe("#fff4e9");
  });

  it("declares no share target while 사진 is hidden", () => {
    // Ticket 08 added the share target; the couple app hides 사진 (brief §3)
    // and turns the target off with it (2026-11-01), so the share sheet does
    // not offer a section nobody can see. The switch is SHARE_PHOTOS in
    // app/manifest.ts.
    const target = (m as unknown as { share_target?: unknown }).share_target;
    expect(target).toBeUndefined();
    expect(SECTIONS.find((s) => s.id === "photos")?.hidden).toBe(true);
  });

  it("keeps the share target's route, so switching it back on cannot 404", () => {
    // The guard the old assertion carried, kept for the day it comes back:
    // the route the target names must still exist.
    const manifestSource = readFileSync(join(appDir, "manifest.ts"), "utf8");
    const action = /action: "([^"]+)"/.exec(manifestSource)?.[1] ?? "";
    expect(action).toBe("/photos/import");
    expect(existsSync(join(appDir, action.replace(/^\//, ""), "route.ts"))).toBe(true);
  });
});

describe("the iOS install treatment", () => {
  // iOS ignores the web manifest when adding to the home screen, so these meta
  // tags are the only thing standing between us and a Safari-tab "app" with a
  // screenshot for an icon. They are easy to delete by accident while tidying
  // the layout, and nothing else would notice.
  const layout = readFileSync(join(appDir, "layout.tsx"), "utf8");

  it("declares appleWebApp so the installed app launches standalone", () => {
    expect(layout).toContain("appleWebApp");
    expect(layout).toContain("capable: true");
  });

  it("emits the apple-prefixed capable tag Safari actually reads", () => {
    // `appleWebApp.capable` alone is NOT enough: Next 15 renders it as the
    // unprefixed `mobile-web-app-capable`, which Safari ignores. The
    // apple-prefixed tag is hand-written in the layout's <head> and is the only
    // thing making the installed app standalone on iOS. Deleting it as an
    // apparent duplicate breaks iPhone install and nothing on Android notices.
    expect(layout).toContain('name="apple-mobile-web-app-capable"');
  });

  it("ships the apple-touch-icon the layout points at", () => {
    expect(layout).toContain("apple-touch-icon.png");

    const file = join(publicDir, "icons", "apple-touch-icon.png");
    expect(existsSync(file)).toBe(true);

    // 180x180 is what iOS wants; it downscales from there.
    expect(pngSize(file)).toEqual({ width: 180, height: 180 });
  });

  it("sets viewport-fit=cover, which the tab bar's safe-area padding needs", () => {
    // Without this, env(safe-area-inset-bottom) is always 0 on iPhone and the
    // tab bar sits above a blank letterbox band.
    expect(layout).toContain('viewportFit: "cover"');
  });
});

/**
 * Reads a PNG's real dimensions from its IHDR chunk.
 *
 * A PNG is an 8-byte signature, then the IHDR chunk: 4-byte length, 4-byte
 * type, then width and height as big-endian uint32s at offsets 16 and 20.
 * Sixteen lines here beats a dependency for reading two integers.
 */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(signature)) {
    throw new Error(`${file} is not a PNG`);
  }

  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
