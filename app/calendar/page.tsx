import { SectionPage } from "../SectionPage";

/**
 * 달력 — the calendar, which is an agenda and not a grid.
 *
 * Empty by design: ticket 07 delivers the forward-scrolling agenda. This tab is
 * the sixth slot that dropping the home shortcut grid freed up — five was never
 * a designed limit.
 */
export default function CalendarPage() {
  return <SectionPage title="달력" />;
}
