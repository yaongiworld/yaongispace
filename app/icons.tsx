/**
 * The six tab icons, inlined from Phosphor Icons (MIT).
 *
 * CLAUDE.md permits Phosphor or Iconoir for UI chrome, and the obvious move is
 * to `npm i @phosphor-icons/react`. That was considered and rejected for this
 * particular use:
 *
 *   - The package is a barrel of ~9,000 icon components. Next.js can prune it
 *     with `optimizePackageImports`, but the pruning is a build-time nicety we
 *     would be relying on rather than a guarantee, and the tab bar is the one
 *     component that renders on literally every screen of a mobile-first app.
 *   - We need exactly six glyphs, forever. Six `<path d="…">` strings is ~2KB
 *     of source against a dependency we would have to keep upgrading for the
 *     next decade of an app explicitly built to last decades.
 *
 * So the paths are copied verbatim from `@phosphor-icons/core@2.1.10`,
 * `assets/regular/`, which is MIT licensed — see `public/icons/LICENSE-phosphor.txt`.
 * They are *not* redrawn or hand-tweaked: if one ever needs updating, re-copy it
 * from the same source rather than editing the `d` attribute by hand.
 *
 * Regular weight, not bold: Soft Clay is a soft theme, and the bold weight reads
 * as a heavier, more utilitarian app than this one wants to be.
 */

type IconProps = {
  /** Rendered at 26px in the tab bar. Kept as a prop so a section can reuse a
   *  glyph at its own size without a second copy of the path. */
  size?: number;
};

/**
 * Every icon shares one wrapper so the viewBox, the fill rule and the
 * accessibility treatment cannot drift between them.
 *
 * `aria-hidden` is deliberate and load-bearing: in the tab bar each icon sits
 * beside its own Korean text label, so exposing the glyph to a screen reader
 * would announce the destination twice. The label is the accessible name.
 */
function Glyph({ size = 26, path }: IconProps & { path: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

/** house — 홈 */
export function HouseIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      path="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z"
    />
  );
}

/** envelope — 편지 */
export function EnvelopeIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      path="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48Zm-96,85.15L52.57,64H203.43ZM98.71,128,40,181.81V74.19Zm11.84,10.85,12,11.05a8,8,0,0,0,10.82,0l12-11.05,58,53.15H52.57ZM157.29,128,216,74.18V181.82Z"
    />
  );
}

/** images — 사진 */
export function ImagesIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      path="M216,40H72A16,16,0,0,0,56,56V72H40A16,16,0,0,0,24,88V200a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16V184h16a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM72,56H216v62.75l-10.07-10.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L72,109.37ZM184,200H40V88H56v80a16,16,0,0,0,16,16H184Zm32-32H72V132l36-36,49.66,49.66a8,8,0,0,0,11.31,0L194.63,120,216,141.38V168ZM160,84a12,12,0,1,1,12,12A12,12,0,0,1,160,84Z"
    />
  );
}

/** map-trifold — 지도 */
export function MapIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      path="M228.92,49.69a8,8,0,0,0-6.86-1.45L160.93,63.52,99.58,32.84a8,8,0,0,0-5.52-.6l-64,16A8,8,0,0,0,24,56V200a8,8,0,0,0,9.94,7.76l61.13-15.28,61.35,30.68A8.15,8.15,0,0,0,160,224a8,8,0,0,0,1.94-.24l64-16A8,8,0,0,0,232,200V56A8,8,0,0,0,228.92,49.69ZM104,52.94l48,24V203.06l-48-24ZM40,62.25l48-12v127.5l-48,12Zm176,131.5-48,12V78.25l48-12Z"
    />
  );
}

/**
 * calendar-heart — 달력.
 *
 * The plain `calendar` glyph was the neutral pick; the heart variant is
 * chosen because this calendar is an agenda of anniversaries and things to
 * look forward to for two people, not a work calendar.
 */
export function CalendarIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      path="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V208ZM152,88a31.91,31.91,0,0,0-24,10.86A32,32,0,0,0,72,120c0,36.52,50.28,62.08,52.42,63.16a8,8,0,0,0,7.16,0C133.72,182.08,184,156.52,184,120A32,32,0,0,0,152,88Zm-24,78.93c-13.79-7.79-40-26.75-40-46.93a16,16,0,0,1,32,0,8,8,0,0,0,16,0,16,16,0,0,1,32,0C168,140.19,141.79,159.15,128,166.93Z"
    />
  );
}

/**
 * sparkle — 기억.
 *
 * Not a magnifying glass. CONTEXT.md is explicit that Recall is *not* search
 * ("_Avoid_: Search, query, RAG, chat, assistant") — it is remembering, and a
 * magnifying glass would teach the wrong mental model on the tab bar, which is
 * the most-seen surface in the app.
 */
export function SparkleIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      path="M197.58,129.06,146,110l-19-51.62a15.92,15.92,0,0,0-29.88,0L78,110l-51.62,19a15.92,15.92,0,0,0,0,29.88L78,178l19,51.62a15.92,15.92,0,0,0,29.88,0L146,178l51.62-19a15.92,15.92,0,0,0,0-29.88ZM137,164.22a8,8,0,0,0-4.74,4.74L112,223.85,91.78,169A8,8,0,0,0,87,164.22L32.15,144,87,123.78A8,8,0,0,0,91.78,119L112,64.15,132.22,119a8,8,0,0,0,4.74,4.74L191.85,144ZM144,40a8,8,0,0,1,8-8h16V16a8,8,0,0,1,16,0V32h16a8,8,0,0,1,0,16H184V64a8,8,0,0,1-16,0V48H152A8,8,0,0,1,144,40ZM248,88a8,8,0,0,1-8,8h-8v8a8,8,0,0,1-16,0V96h-8a8,8,0,0,1,0-16h8V72a8,8,0,0,1,16,0v8h8A8,8,0,0,1,248,88Z"
    />
  );
}
