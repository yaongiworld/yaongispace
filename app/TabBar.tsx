"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS } from "./sections";

/**
 * The tab bar — the app's primary and only navigation.
 *
 * A client component, and it has to be: it reads `usePathname()` to know which
 * tab is current. It is the *only* client component in the shell, so the six
 * section pages stay server components and can fetch their own data freely in
 * tickets 05–08.
 *
 * ## Why it is fixed to the bottom
 *
 * Mobile is the primary surface (ticket 04), and installed to the home screen
 * this app is a standalone window with no browser chrome — so the bottom edge
 * is both the reachable zone for a thumb and the place a native app puts its
 * tabs. Desktop merely works: the same bar sits at the bottom of a centred
 * column rather than growing into a sidebar, because a sidebar would be a
 * second navigation design to maintain for a surface neither of us uses much.
 *
 * ## Fitting six on a phone
 *
 * Six was a deliberate count, not a limit we squeezed past. The bar earns the
 * room three ways, and all three matter — remove one and it gets tight at
 * 360px:
 *
 *   1. **Two-syllable Korean labels** (see `sections.ts`) — no truncation, no
 *      shrinking type below 10px.
 *   2. **`flex-1` tabs with no horizontal padding of their own.** Each tab is
 *      an equal sixth of the bar and its tap target is that whole sixth. The
 *      visual gap between tabs is whitespace inside the target, not margin
 *      between targets, so the touch targets stay contiguous — there is no
 *      dead pixel between two tabs to mis-tap into.
 *   3. **Icon above label**, not beside it. Stacking is what makes six fit; a
 *      row of icon+label pairs would need roughly double the width.
 *
 * Each tab is ~60px wide and 52px tall at 360px, comfortably over the 44px
 * minimum touch target on both platforms.
 */
export function TabBar() {
  const pathname = usePathname();

  return (
    /* `pb-[env(safe-area-inset-bottom)]` is what keeps the bar off the iPhone
       home indicator when installed standalone. It pairs with
       `viewportFit: "cover"` in the root layout — without that, iOS letterboxes
       the page and the inset is always 0, so the two must stay together. */
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)]"
      style={{
        /* A puffy white card, matching the theme, rather than a flat bar.
           Blurring what scrolls underneath is what lets it be translucent
           without the text behind it turning it into mush. */
        background: "var(--color-clay-card)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "0 -6px 20px rgb(190 140 120 / 0.14)",
      }}
    >
      <ul className="mx-auto flex max-w-md items-stretch px-1">
        {SECTIONS.map(({ id, href, label, Icon }) => {
          /* Home is an exact match; every other section also owns its
             subpaths, so `/letters/42` keeps the 편지 tab lit. Doing this with
             `startsWith` on `/` alone would light home on every page. */
          const isCurrent =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <li key={id} className="flex-1">
              <Link
                href={href}
                /* `aria-current="page"` is the accessible half of the selected
                   state — colour alone would not announce it. */
                aria-current={isCurrent ? "page" : undefined}
                className="flex flex-col items-center gap-0.5 rounded-[18px] py-2 transition-colors"
                style={{
                  color: isCurrent
                    ? "var(--color-clay-berry)"
                    : "var(--color-clay-ink-soft)",
                }}
              >
                <Icon size={24} />
                {/* 10px is small, but these are two-syllable Hangul labels
                    beneath a 24px icon that already carries the meaning — the
                    label is confirmation, not the primary signal. */}
                <span className="text-[10px] leading-none font-semibold">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
