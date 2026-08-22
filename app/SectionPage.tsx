/**
 * The frame every section page sits in.
 *
 * Ticket 04 delivers six *empty* themed pages; tickets 05–08 fill them. This
 * component exists so that when they do, they inherit the shell's spacing,
 * heading treatment and — importantly — the bottom padding that keeps content
 * clear of the fixed tab bar, without each ticket re-deriving those numbers and
 * getting a slightly different answer.
 *
 * A section fills its page by passing `children`. Passing none renders the
 * placeholder, which is what four of the six do today.
 */

export function SectionPage({
  title,
  children,
}: {
  /** The Korean section title. Matches the tab label. */
  title: string;
  children?: React.ReactNode;
}) {
  return (
    /* `pb-28` clears the tab bar (≈52px of bar, plus its safe-area inset, plus
       breathing room). Scrolling content must never end underneath the bar —
       if you build a section with its own scroll container, keep this padding
       on the scrolling element, not on an ancestor. */
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-10 pb-28">
      <h1
        className="text-3xl text-clay-ink"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h1>
      {children ?? <SectionPlaceholder />}
    </main>
  );
}

/**
 * What an unbuilt section shows.
 *
 * Deliberately a warm, finished-looking empty card rather than "TODO" or a
 * spinner: at this stage the thing being verified is that navigation works, and
 * a page that looks broken makes a working tab bar look broken too.
 *
 * Note this is *not* the same as the "warm nothing" of a quiet day on the home
 * page (ticket 06) — that is a real state of a real feature. This is scaffolding
 * and should be deleted by whichever ticket fills the section in.
 */
function SectionPlaceholder() {
  return (
    <div
      className="flex flex-col items-center gap-2 px-6 py-12 text-center"
      style={{
        background: "var(--color-clay-card-quiet)",
        borderRadius: "var(--radius-clay-lg)",
        boxShadow: "var(--shadow-clay)",
      }}
    >
      <p className="text-sm text-clay-ink-soft">아직 준비 중이에요</p>
    </div>
  );
}
