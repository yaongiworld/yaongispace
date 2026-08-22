import localFont from "next/font/local";

/**
 * Every Korean-bearing face is loaded with `next/font/local`, never
 * `next/font/google`.
 *
 * `next/font/google` silently filters CJK subsets out of its output
 * (ADR-0007). The failure is not an error — the font simply loads without
 * Hangul and Korean text renders as tofu boxes, which is easy to miss in
 * review and impossible to miss in production. Self-hosting is the only
 * reliable path, so the .woff2 files live in `public/fonts/` with their OFL
 * licences beside them.
 */

/** Body face. Its Latin glyphs are drawn to match its Hangul, so mixed
 *  한글/English sentences do not seam mid-line. */
export const pretendard = localFont({
  src: [
    { path: "../public/fonts/Pretendard-Regular.subset.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/Pretendard-SemiBold.subset.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/Pretendard-Bold.subset.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-pretendard",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "-apple-system", "Apple SD Gothic Neo", "sans-serif"],
});

/** Display face for Korean headings. Covers the 2,367 common Hangul
 *  syllables the typeface ships; rarer ones fall back to Pretendard. */
export const jua = localFont({
  src: "../public/fonts/Jua-Regular.subset.woff2",
  weight: "400",
  variable: "--font-jua",
  display: "swap",
  // Not preloaded: a display face below the fold. `swap` renders it when it
  // arrives, which on a phone-first app beats 355KB of blocking preload.
  preload: false,
  fallback: ["system-ui", "sans-serif"],
});

/**
 * Display face for Latin headings. Variable (weight + width).
 *
 * ADR-0007 permits Latin-only faces to use the Google loader — this one is
 * self-hosted anyway, deliberately: it keeps the app from making a request to
 * fonts.gstatic.com on every visit, which *privacy by default* argues for, and
 * it means every face the app uses is served from one place with its licence
 * beside it. Cost: 63KB in the repo. The CJK reasoning above does not apply
 * here.
 */
export const fredoka = localFont({
  src: "../public/fonts/Fredoka.subset.woff2",
  weight: "300 600",
  variable: "--font-fredoka",
  display: "swap",
  // Not preloaded, as above.
  preload: false,
  fallback: ["system-ui", "sans-serif"],
});

export const fontVariables = `${pretendard.variable} ${jua.variable} ${fredoka.variable}`;
