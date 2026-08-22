import { db } from "@/lib/db";
import { initialWindow } from "@/lib/calendar/agenda";
import { occurrencesBetween } from "@/lib/calendar/events";
import { Agenda, type SerialisedOccurrence } from "./Agenda";

/**
 * 달력 — the calendar, which is an agenda and not a grid.
 *
 * **No month view is built, not even behind a toggle.** For two people it is
 * twenty-seven empty cells and a fortnight of chrome around the three days that
 * matter; the agenda shows the same information in the order it is actually
 * read. This is a decision recorded in the ticket and in CLAUDE.md, not a
 * simplification waiting to be undone.
 *
 * Rendered on the server so the first paint already has the Events in it — an
 * agenda that opens at today cannot open at today if it does not yet know what
 * today holds.
 */

export const metadata = {
  title: "달력 · 야옹이월드",
};

/* The agenda is a window over now, so it can never be statically cached. */
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const now = new Date();
  const { from, to } = initialWindow(now);

  const [occurrences, people] = await Promise.all([
    occurrencesBetween(from, to),
    /* The names we call each other, never our legal names. */
    db()
      .query<{ id: string; display_name: string }>(
        "SELECT id, display_name FROM person",
      )
      .then(({ rows }) =>
        Object.fromEntries(rows.map((r) => [r.id, r.display_name])),
      ),
  ]);

  const serialised: SerialisedOccurrence[] = occurrences.map((o) => ({
    ...o,
    occursAt: o.occursAt.toISOString(),
    occurredAt: o.occurredAt.toISOString(),
    endsAt: o.endsAt?.toISOString() ?? null,
  }));

  return (
    /*
      Not `SectionPage`, deliberately — it is a convenience, not a contract, and
      its `pb-28` lives on `<main>`, which is right only when the page itself
      scrolls. This section scrolls inside its own box, so the frame is fixed to
      the viewport and the padding moves onto the scroller inside `Agenda`. The
      heading treatment and spacing are matched to `SectionPage` by hand so the
      calendar still looks like its five neighbours.
    */
    <main className="mx-auto flex h-dvh max-w-md flex-col gap-4 px-5 pt-10">
      <h1
        className="shrink-0 text-3xl text-clay-ink"
        style={{ fontFamily: "var(--font-display)" }}
      >
        달력
      </h1>
      <Agenda occurrences={serialised} people={people} />
    </main>
  );
}
