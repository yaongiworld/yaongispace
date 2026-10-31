import {
  BarbellIcon,
  CalendarIcon,
  EnvelopeIcon,
  GlobeIcon,
  HouseIcon,
  ImagesIcon,
  MapIcon,
  SparkleIcon,
} from "./icons";

/**
 * The sections of Yaongispace, in tab order.
 *
 * This is the single source of truth for navigation. The tab bar renders the
 * visible ones, the manifest's shortcuts are generated from the same visible
 * list, and the test asserts that every `href` here — hidden or not — has a
 * real route behind it, so a tab can never point at a 404 and a hidden section
 * can be switched back on without discovering its page has gone.
 *
 * ## Five visible, four hidden (2026-11-01)
 *
 * The couple app (NEW_ROOM_BRIEF.md §3) replaced the original six with five:
 * Today · Workout · Era · Moments · Letters. The old 사진 · 지도 · 달력 · 기억
 * sections are **hidden, not deleted** — their code and data stay exactly as
 * they were and their URLs still open when typed. Bringing one back is
 * deleting its `hidden: true`, nothing else.
 */

/**
 * Labels are English, hardcoded, by decision (brief §9, 충돌 3) — and still no
 * switcher and no i18n scaffolding: the tab names are fixed words, everything
 * else in the app stays Korean. See CLAUDE.md, "The app speaks Korean".
 *
 * Five tabs across a 320px phone gives each ~62px. The longest label,
 * "Moments", is ~44px at the bar's 10px semibold, which is why five English
 * words fit where six would not have.
 */
export type Section = {
  /** The route. Today is `/`, which is why this is not derived from the id. */
  href: string;
  /** The tab label. Hardcoded — see above. */
  label: string;
  /**
   * A stable, English, non-user-facing id. Used for React keys and for
   * manifest shortcut ids. Never rendered. Today keeps the id `home`: it *is*
   * the home route, and renaming it would only churn the manifest.
   */
  id: string;
  Icon: (props: { size?: number }) => React.JSX.Element;
  /** Kept, routed, and left out of the bar and the manifest. */
  hidden?: true;
};

export const SECTIONS: readonly Section[] = [
  { id: "home", href: "/", label: "Today", Icon: HouseIcon },
  { id: "workout", href: "/workout", label: "Workout", Icon: BarbellIcon },
  { id: "era", href: "/era", label: "Era", Icon: GlobeIcon },
  { id: "moments", href: "/moments", label: "Moments", Icon: CalendarIcon },
  { id: "letters", href: "/letters", label: "Letters", Icon: EnvelopeIcon },

  /* Hidden (brief §3 and the 2026-11-01 answers). Delete `hidden: true` to
     bring one back. 지도 and 달력 are superseded by Era and Moments rather
     than merely paused; they are kept because 달력's agenda and its Events
     (migration 005) still back Moments' anniversaries. */
  { id: "photos", href: "/photos", label: "사진", Icon: ImagesIcon, hidden: true },
  { id: "map", href: "/map", label: "지도", Icon: MapIcon, hidden: true },
  { id: "calendar", href: "/calendar", label: "달력", Icon: CalendarIcon, hidden: true },
  /**
   * 기억 ("memory"), not 검색 ("search") and not 회상.
   *
   * CONTEXT.md defines Recall as remembering across our own Entries and
   * explicitly tells us to avoid the word "search".
   */
  { id: "recall", href: "/recall", label: "기억", Icon: SparkleIcon, hidden: true },
] as const;

/** What the tab bar and the manifest show. */
export const VISIBLE_SECTIONS: readonly Section[] = SECTIONS.filter((s) => !s.hidden);
