"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  agendaDayHeading,
  anniversaryLabel,
  koreanTime,
  seoulDayKey,
} from "@/lib/calendar/dates";
import { buildAgenda, type AgendaDay } from "@/lib/calendar/agenda";
import type { Occurrence } from "@/lib/calendar/events";
import { EventForm } from "./EventForm";

/**
 * The agenda: a forward-scrolling list that opens at today.
 *
 * **There is no month grid here and there must not be one, not even behind a
 * toggle.** For two people a month view is twenty-seven empty cells and a
 * fortnight of chrome around the three days that matter. This is a decision,
 * not a default — see the ticket.
 *
 * The past is above, not gone. Events do not vanish when they happen; scrolling
 * up walks back through them, which is the natural gesture for "what were we
 * doing last month" and costs no extra UI.
 *
 * Occurrences arrive from the server already projected — a yearly repeat is one
 * stored row rendered on each anniversary — so nothing in this component knows
 * how recurrence works, and nothing here should learn.
 */

/** Serialised over the wire, so dates arrive as strings. */
export interface SerialisedOccurrence
  extends Omit<Occurrence, "occursAt" | "occurredAt" | "endsAt"> {
  occursAt: string;
  occurredAt: string;
  endsAt: string | null;
}

const revive = (o: SerialisedOccurrence): Occurrence => ({
  ...o,
  occursAt: new Date(o.occursAt),
  occurredAt: new Date(o.occurredAt),
  endsAt: o.endsAt ? new Date(o.endsAt) : null,
});

export function Agenda({
  occurrences,
  people,
}: {
  occurrences: SerialisedOccurrence[];
  /** Person id → the name we call each other. Never our legal names. */
  people: Record<string, string>;
}) {
  const [editing, setEditing] = useState<Occurrence | null>(null);
  const [composing, setComposing] = useState(false);

  /**
   * `now` is fixed at mount rather than read on every render.
   *
   * Otherwise "오늘" could move mid-session and the day the page scrolled to
   * would silently stop being the day it highlights.
   */
  const [now] = useState(() => new Date());

  const days = useMemo(
    () => buildAgenda(occurrences.map(revive), now),
    [occurrences, now],
  );

  const todayRef = useRef<HTMLElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Open at today, with the past above it.
   *
   * Jumped to without animation on first paint: this is where the page *opens*,
   * not somewhere it travels to, and a visible scroll would suggest the reader
   * had missed something above. `"auto"` rather than `"smooth"` says so.
   */
  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, []);

  const todayKey = seoulDayKey(now);

  return (
    <>
      {/*
        The scrolling element carries `pb-28`, not an ancestor.

        `SectionPage` puts that padding on `<main>`, which is right when the
        page itself scrolls. This agenda scrolls inside its own box, so the
        padding has to move onto the box — on the ancestor it would pad the
        viewport and the last Event of the year would still end underneath the
        tab bar, which is exactly the bug the shell's comment warns about.
      */}
      <div
        ref={scrollerRef}
        className="-mx-1 flex-1 overflow-y-auto px-1 pb-28"
        style={{ scrollbarWidth: "none" }}
      >
        <PastEdge />
        <ol className="flex flex-col gap-6">
          {days.map((day) => (
            <AgendaDayRow
              key={day.key}
              day={day}
              now={now}
              people={people}
              onEdit={setEditing}
              ref={day.key === todayKey ? todayRef : undefined}
            />
          ))}
        </ol>
      </div>

      <NewEventButton onClick={() => setComposing(true)} />

      {composing && (
        <EventForm
          mode="create"
          onClose={() => setComposing(false)}
        />
      )}
      {editing && (
        <EventForm
          mode="edit"
          event={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/**
 * The line above the first day, saying the past is up there.
 *
 * Without it an agenda that opens at today looks like a list that *begins* at
 * today, and nobody scrolls up through what appears to be the top of a page.
 * One quiet line is cheaper than a "load earlier" button and does not invite
 * tapping.
 */
function PastEdge() {
  return (
    <p className="pb-6 text-center text-xs text-clay-ink-soft">
      위로 올리면 지난 일들이 있어요
    </p>
  );
}

const AgendaDayRow = function AgendaDayRow({
  day,
  now,
  people,
  onEdit,
  ref,
}: {
  day: AgendaDay;
  now: Date;
  people: Record<string, string>;
  onEdit: (occurrence: Occurrence) => void;
  ref?: React.Ref<HTMLElement>;
}) {
  return (
    <li>
      <section ref={ref} className="scroll-mt-4">
        <h2
          className={`pb-2 text-sm ${
            day.isToday ? "text-clay-berry" : "text-clay-ink-soft"
          }`}
        >
          {agendaDayHeading(day.date, now)}
        </h2>

        {day.occurrences.length === 0 ? (
          /* Only ever today — every other empty day is simply not rendered.
             A warm nothing, never a prompt to add something. */
          <p className="px-1 text-sm text-clay-ink-soft">오늘은 조용해요</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {day.occurrences.map((occurrence) => (
              <li key={`${occurrence.id}-${occurrence.occursAt.toISOString()}`}>
                <EventCard
                  occurrence={occurrence}
                  who={people[occurrence.personId]}
                  onEdit={onEdit}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </li>
  );
};

function EventCard({
  occurrence,
  who,
  onEdit,
}: {
  occurrence: Occurrence;
  who: string | undefined;
  onEdit: (occurrence: Occurrence) => void;
}) {
  const anniversary = occurrence.repeatsYearly
    ? anniversaryLabel(occurrence.occursAt, occurrence.occurredAt)
    : null;

  return (
    <button
      type="button"
      onClick={() => onEdit(occurrence)}
      className="w-full bg-clay-card px-4 py-3 text-left transition-transform active:scale-[0.99]"
      style={{
        borderRadius: "var(--radius-clay)",
        boxShadow: "var(--shadow-clay)",
      }}
    >
      <div className="flex items-baseline gap-2">
        {/* An all-day thing has no clock time and the UI must not invent one. */}
        <span className="shrink-0 text-xs text-clay-ink-soft">
          {occurrence.allDay ? "하루 종일" : koreanTime(occurrence.occursAt)}
        </span>
        <span className="flex-1 text-base leading-snug text-clay-ink">
          {occurrence.title}
        </span>
      </div>

      {(anniversary || occurrence.repeatsYearly || occurrence.description) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
          {anniversary && (
            <span className="text-xs text-clay-berry">{anniversary}</span>
          )}
          {occurrence.repeatsYearly && !anniversary && (
            <span className="text-xs text-clay-ink-soft">해마다</span>
          )}
          {occurrence.description && (
            <span className="text-xs text-clay-ink-soft">
              {occurrence.description}
            </span>
          )}
        </div>
      )}

      {who && (
        <p className="pt-1 text-xs text-clay-ink-soft">{who}가 넣었어요</p>
      )}
    </button>
  );
}

/**
 * Adding an Event.
 *
 * Fixed above the tab bar rather than in the page header: the agenda scrolls,
 * and a button that scrolled away would leave the calendar's one write action
 * reachable only from wherever the reader started.
 */
function NewEventButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="일정 넣기"
      className="fixed right-5 z-10 flex h-14 w-14 items-center justify-center bg-clay-berry text-2xl text-white transition-transform active:scale-95"
      style={{
        /* Clear of the tab bar and its safe-area inset, the same way
           `SectionPage`'s `pb-28` clears it for scrolling content. */
        bottom: "calc(5.5rem + env(safe-area-inset-bottom))",
        borderRadius: "var(--radius-clay-pill)",
        boxShadow: "var(--shadow-clay-lift)",
      }}
    >
      +
    </button>
  );
}
