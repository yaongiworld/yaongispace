import type { Metadata, Viewport } from "next";
import { fontVariables } from "./fonts";
import { TabBar } from "./TabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "야옹이월드",
  description: "토위와 양초의 공간",

  /* Next emits `<link rel="manifest">` from this. The manifest itself is
     generated at `app/manifest.ts`. */
  manifest: "/manifest.webmanifest",

  /**
   * iOS needs its own install treatment — the manifest alone does not cover it.
   *
   * Safari does not read `icons`, `name` or `display` from the web manifest
   * when you "Add to Home Screen". It reads these instead, and without them
   * Yangcho's iPhone would install a screenshot of the page as the icon and
   * launch it in a Safari tab with the address bar showing. So:
   *
   *   - `appleWebApp.capable` → `apple-mobile-web-app-capable`, which is what
   *     makes the launched app standalone on iOS. This is the iOS counterpart
   *     of `display: "standalone"` in the manifest.
   *   - `appleWebApp.title` → the name under the home-screen icon. It must be
   *     kept in step with `short_name` in the manifest.
   *   - `icons.apple` → `<link rel="apple-touch-icon">`. 180×180 is the size
   *     iOS actually wants; it downscales from there for smaller devices.
   *
   * `statusBarStyle: "default"` gives a legible dark-on-light status bar, which
   * is right for a light-only app. Do NOT set `black-translucent` here: it
   * makes the status bar float over the page content, and the tab bar's
   * safe-area handling only covers the bottom inset.
   */
  appleWebApp: {
    capable: true,
    title: "야옹이월드",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },

  /* Installed to the home screen, every relative URL still has to resolve, and
     `metadataBase` is what Next uses to absolutise them. Localhost in dev; set
     the real origin via the Vercel-provided env var in production. */
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Light only, by decision — no dark mode anywhere.
  colorScheme: "light",
  /* Matches `theme_color` and `background_color` in the manifest. Change all
     three together or Android's status bar will not match the page. */
  themeColor: "#fff4e9",
  /**
   * `viewport-fit=cover` — required, and it pairs with the tab bar.
   *
   * Without it, iOS letterboxes the page inside the safe area, which sounds
   * convenient but means `env(safe-area-inset-bottom)` is always 0 and the
   * page never reaches the screen edges — the fixed tab bar would sit above a
   * blank band. With it, the page fills the display and the tab bar's own
   * `pb-[env(safe-area-inset-bottom)]` lifts its contents clear of the home
   * indicator. Removing this silently breaks the bar's spacing on iPhone.
   */
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={fontVariables}>
      <head>
        {/*
          `apple-mobile-web-app-capable`, written by hand.

          `metadata.appleWebApp.capable` above looks like it covers this, and it
          does not: Next 15 renders it as the modern, unprefixed
          `<meta name="mobile-web-app-capable">` only — verified by grepping the
          built HTML, which carries the unprefixed tag and no apple-prefixed one.

          Chrome honours the unprefixed name. **Safari does not**, and it is the
          apple-prefixed tag that makes an added-to-home-screen app launch
          without the address bar on iOS. Without this line the app installs on
          Yangcho's iPhone and then opens in a Safari tab, which is the exact
          failure this ticket is meant to prevent, and it is invisible from
          Android.

          Both tags are harmless together. If a future Next.js starts emitting
          the prefixed tag itself, this becomes a duplicate and can go — check
          the built HTML before deleting it, not the Next docs.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {children}
        {/* Outside `children` so it persists across navigations and is never
            re-mounted by a section — the bar is the app's chrome, not part of
            any page. Sections are responsible for not scrolling content
            underneath it; `SectionPage` handles that with bottom padding. */}
        <TabBar />
      </body>
    </html>
  );
}
