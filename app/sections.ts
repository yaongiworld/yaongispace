import {
  CalendarIcon,
  EnvelopeIcon,
  HouseIcon,
  ImagesIcon,
  MapIcon,
  SparkleIcon,
} from "./icons";

/**
 * The six sections of Yaongispace, in tab order.
 *
 * This is the single source of truth for navigation. The tab bar renders it,
 * the manifest's shortcuts are generated from it, and the test asserts that
 * every `href` here has a real route behind it — so a tab can never point at a
 * 404, and the manifest can never drift from the bar.
 *
 * Adding a seventh section means adding it here and adding its `app/<x>/page.tsx`.
 * Nothing else needs to change. (Do not add a seventh section lightly: six was
 * a deliberate count, and the bar is designed to be comfortable at exactly six
 * on a phone.)
 */

/**
 * Labels are Korean and hardcoded, by decision — there is no switcher and no
 * i18n scaffolding, because the only two people who will ever use this app both
 * read Korean. See CLAUDE.md, "The app speaks Korean".
 *
 * Each label is deliberately **two syllables**. That is not an accident of
 * vocabulary: six items across a ~360px phone gives each tab ~60px, and a
 * three-syllable Korean label at a legible size does not fit without either
 * truncating or shrinking the type past comfort. Where a longer word was the
 * natural one, the two-syllable synonym was chosen instead — see 기억 below.
 */
export type Section = {
  /** The route. Home is `/`, which is why this is not derived from the id. */
  href: string;
  /** The Korean tab label. Hardcoded — see above. */
  label: string;
  /**
   * A stable, English, non-user-facing id. Used for React keys, for manifest
   * shortcut ids, and as the name the tickets and the ORCHESTRATION doc use
   * ("home · letters · photos · map · calendar · recall"). Never rendered.
   */
  id: string;
  Icon: (props: { size?: number }) => React.JSX.Element;
};

export const SECTIONS: readonly Section[] = [
  { id: "home", href: "/", label: "홈", Icon: HouseIcon },
  { id: "letters", href: "/letters", label: "편지", Icon: EnvelopeIcon },
  { id: "photos", href: "/photos", label: "사진", Icon: ImagesIcon },
  { id: "map", href: "/map", label: "지도", Icon: MapIcon },
  { id: "calendar", href: "/calendar", label: "달력", Icon: CalendarIcon },
  /**
   * 기억 ("memory"), not 검색 ("search") and not 회상.
   *
   * CONTEXT.md defines Recall as remembering across our own Entries and
   * explicitly tells us to avoid the word "search". 기억 is what the section
   * *is* to the two of us, it is two syllables like its five neighbours, and
   * it does not promise a search engine.
   */
  { id: "recall", href: "/recall", label: "기억", Icon: SparkleIcon },
] as const;
