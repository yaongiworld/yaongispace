import type { MetadataRoute } from "next";
import { SECTIONS } from "./sections";

/**
 * The PWA manifest, served at `/manifest.webmanifest`.
 *
 * A route (`app/manifest.ts`) rather than a static `public/manifest.json` so
 * the shortcuts can be generated from `SECTIONS` — one list of sections, no
 * chance of the manifest and the tab bar disagreeing about what this app
 * contains.
 *
 * ## Installing on both platforms
 *
 * Android/Chrome installs from this file alone. **iOS does not.** Safari
 * ignores `name`, `theme_color` and `icons` here when adding to the home
 * screen, and reads `apple-mobile-web-app-*` meta tags and
 * `<link rel="apple-touch-icon">` instead. Those live in `app/layout.tsx`, and
 * the two must be kept in step — see the comment there. Changing the app name
 * or the icon in this file only is a real and easy mistake: it will look
 * correct on Android and silently stay stale on Yangcho's iPhone.
 *
 * ## The share target (ticket 08)
 *
 * `share_target` is what puts Yaongispace in the phone's share sheet, so photos
 * arrive from the photo app rather than through a file picker. Ticket 04
 * deliberately left it out — a target pointing at a route that does not exist
 * appears in the sheet and then fails — and ticket 08 adds it now that
 * `/photos/import` is real.
 *
 * `MetadataRoute.Manifest` does not type it: `share_target` is a Chromium
 * extension rather than part of the W3C manifest, so the return type is widened
 * by intersection below. The typed manifest is kept for everything else rather
 * than abandoned for a static JSON file to dodge one key.
 *
 * **iOS does not implement share targets at all.** On Yangcho's iPhone photos
 * arrive through the import page's own file picker instead. That is the reason
 * `/photos/import` accepts both a POST from the share sheet and a plain visit.
 */

/**
 * The manifest type, widened for the share target Next does not type.
 *
 * `method: "POST"` with `enctype: "multipart/form-data"` is what makes files
 * possible at all — a GET share target can carry a title and a URL but not
 * bytes. The `files` array being an array is what admits a multi-photo share,
 * which is the case that matters: 40 photos after a trip, in one go.
 */
type ManifestWithShareTarget = MetadataRoute.Manifest & {
  share_target: {
    action: string;
    method: "POST";
    enctype: "multipart/form-data";
    params: {
      files: { name: string; accept: string[] }[];
    };
  };
};

export default function manifest(): ManifestWithShareTarget {
  return {
    name: "야옹이월드",
    /* Shown under the icon on the home screen, where there is room for about
       12 characters. Already short, so it matches `name`. */
    short_name: "야옹이월드",
    description: "토위와 양초의 공간",

    /* Standalone: launched from the home screen this opens with no browser
       chrome — no address bar, no tabs. That is the whole point of installing
       it, and it is also why the tab bar has to be real navigation: there is no
       back button on Android's launcher-opened PWA beyond the system gesture. */
    display: "standalone",
    start_url: "/",
    /* Confines the installed app to this origin — an off-origin link opens in
       the browser instead of silently taking over the standalone window. */
    scope: "/",

    /* Korean, matching `<html lang="ko">`. `dir` is explicit rather than
       inherited: Hangul is left-to-right and stating so costs nothing. */
    lang: "ko",
    dir: "ltr",

    /* The Soft Clay dawn peach — the very top of the body gradient, so the
       Android status bar meets the page without a seam. Matches `themeColor`
       in the root layout's viewport export; change both together.
       `background_color` is what fills the splash screen before first paint,
       and it is the same colour for the same reason. */
    theme_color: "#fff4e9",
    background_color: "#fff4e9",

    /* Portrait: this is a phone app for two people. Nothing in it wants to be
       landscape, and a rotating tab bar is a second layout to maintain. */
    orientation: "portrait",

    icons: [
      /* `any` and `maskable` are separate entries pointing at the same file.
         The artwork is drawn with its mark inset to ~66% and its ground painted
         edge to edge (see `icon.svg`), so it survives Android's maskable crop
         without a second asset. If the icon is ever redrawn with detail near
         the edge, split these into two files rather than letting the crop eat
         it. */
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],

    /* Long-pressing the installed icon on Android offers these. Generated from
       SECTIONS, minus home — home is what tapping the icon already does, so
       listing it would be a shortcut to the place you already are. */
    shortcuts: SECTIONS.filter((s) => s.id !== "home").map((s) => ({
      name: s.label,
      short_name: s.label,
      url: s.href,
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    })),

    /* Sharing photos into Yaongispace from the phone's photo app.
       `image/*` rather than a list of types: a phone that invents a new camera
       format should not silently stop being able to share into the library. */
    share_target: {
      action: "/photos/import",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        files: [{ name: "photos", accept: ["image/*"] }],
      },
    },
  };
}
