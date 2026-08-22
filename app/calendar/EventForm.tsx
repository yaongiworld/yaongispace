"use client";

import { useState } from "react";
import type { Occurrence } from "@/lib/calendar/events";
import { koreanDate, seoulDayKey } from "@/lib/calendar/dates";
import {
  createEventAction,
  deleteEventAction,
  updateEventAction,
} from "./actions";

/**
 * Putting something on the calendar, or taking it off.
 *
 * One sheet for both, because create and edit differ by a title and a delete
 * button and nothing else — two forms would be two places to fix the Seoul
 * offset when it turns out to be wrong.
 *
 * **Editing a repeating Event edits the Event.** There is no "this occurrence
 * only" and no "this and all following": a repeat is one stored row, so there
 * is only one thing to change and nothing to disambiguate. That is the whole
 * benefit of the yearly flag over RRULE, and offering the choice would mean
 * building the exception model the ticket rules out.
 */

const SHEET_FIELD =
  "w-full bg-white/70 px-4 py-3 text-base text-clay-ink outline-none placeholder:text-clay-ink-soft";

export function EventForm({
  mode,
  event,
  onClose,
}: {
  mode: "create" | "edit";
  event?: Occurrence;
  onClose: () => void;
}) {
  const [allDay, setAllDay] = useState(event?.allDay ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The form's default moment.
   *
   * On edit, the *stored* date rather than the occurrence being looked at — a
   * repeat opened on its 2026 anniversary is still the 2016 row, and defaulting
   * to 2026 would quietly restate the anniversary as ten years younger the
   * first time anyone fixed a typo.
   */
  const anchor = event?.occurredAt ?? new Date();
  const dayValue = seoulDayKey(anchor);
  const timeValue = event && !event.allDay ? seoulTimeValue(anchor) : "09:00";

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    try {
      if (mode === "edit") await updateEventAction(form);
      else await createEventAction(form);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "잘 안 됐어요.");
      setPending(false);
    }
  }

  async function remove() {
    if (!event) return;
    setPending(true);
    try {
      const form = new FormData();
      form.set("id", event.id);
      await deleteEventAction(form);
      onClose();
    } catch {
      setError("지우지 못했어요.");
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-clay-ink/20 px-3 pb-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-clay-card px-5 pt-5"
        style={{
          borderRadius: "var(--radius-clay-lg)",
          boxShadow: "var(--shadow-clay-lift)",
          paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="pb-4 text-xl text-clay-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {mode === "edit" ? "일정 고치기" : "일정 넣기"}
        </h2>

        <form action={submit} className="flex flex-col gap-3">
          {event && <input type="hidden" name="id" value={event.id} />}

          <input
            name="title"
            required
            defaultValue={event?.title ?? ""}
            placeholder="무슨 일이에요?"
            className={SHEET_FIELD}
            style={{ borderRadius: "var(--radius-clay-sm)" }}
          />

          {/*
            One datetime, assembled from a date and an optional time.

            A bare `datetime-local` would force a clock time onto an
            anniversary, which is the one thing an all-day Event must not have.
            Splitting them lets the time input disappear entirely.
          */}
          <div className="flex gap-2">
            <input
              type="date"
              name="occurredAtDate"
              required
              defaultValue={dayValue}
              className={`${SHEET_FIELD} flex-1`}
              style={{ borderRadius: "var(--radius-clay-sm)" }}
              onChange={(e) => syncHidden(e.currentTarget.form)}
            />
            {!allDay && (
              <input
                type="time"
                name="occurredAtTime"
                defaultValue={timeValue}
                className={`${SHEET_FIELD} w-32`}
                style={{ borderRadius: "var(--radius-clay-sm)" }}
                onChange={(e) => syncHidden(e.currentTarget.form)}
              />
            )}
          </div>

          {/* What the action actually reads — kept in step by `syncHidden`. */}
          <input
            type="hidden"
            name="occurredAt"
            defaultValue={`${dayValue}T${timeValue}`}
          />

          <label className="flex items-center gap-3 px-1 py-1 text-sm text-clay-ink">
            <input
              type="checkbox"
              name="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.currentTarget.checked)}
              className="h-5 w-5 accent-clay-berry"
            />
            하루 종일
          </label>

          {/*
            The entire recurrence feature.

            If you are about to turn this into a frequency dropdown, read the
            ticket: one yearly flag plus a date is the decision. There is no
            RRULE, no expansion and no per-occurrence exception, and the day
            somebody wants to move only next year's anniversary the right
            answer is "no", not a recurrence engine.
          */}
          <label className="flex items-center gap-3 px-1 py-1 text-sm text-clay-ink">
            <input
              type="checkbox"
              name="repeatsYearly"
              defaultChecked={event?.repeatsYearly ?? false}
              className="h-5 w-5 accent-clay-berry"
            />
            해마다 반복
          </label>

          <textarea
            name="description"
            rows={2}
            defaultValue={event?.description ?? ""}
            placeholder="덧붙일 말 (없어도 괜찮아요)"
            className={`${SHEET_FIELD} resize-none`}
            style={{ borderRadius: "var(--radius-clay-sm)" }}
          />

          {event?.repeatsYearly && (
            <p className="px-1 text-xs text-clay-ink-soft">
              {koreanDate(event.occurredAt)}부터 해마다 반복되는 일정이에요.
              고치면 모든 해가 함께 바뀌어요.
            </p>
          )}

          {error && <p className="px-1 text-sm text-clay-berry">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-white/70 px-4 py-3 text-base text-clay-ink-soft"
              style={{ borderRadius: "var(--radius-clay-pill)" }}
            >
              그만두기
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-[2] bg-clay-berry px-4 py-3 text-base text-white disabled:opacity-60"
              style={{ borderRadius: "var(--radius-clay-pill)" }}
            >
              {mode === "edit" ? "고치기" : "넣기"}
            </button>
          </div>

          {mode === "edit" && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="px-4 py-3 text-sm text-clay-ink-soft"
            >
              이 일정 지우기
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

/** "19:30" in Seoul, for the time input's default. */
function seoulTimeValue(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  return parts;
}

/**
 * Keep the hidden `occurredAt` in step with the date and time inputs.
 *
 * The action wants one "2026-08-22T19:30" string and applies Seoul's offset to
 * it; the form shows two controls because an all-day Event must be able to have
 * no time at all. This is the join, and it is a function rather than state
 * because the inputs are uncontrolled — making them controlled would mean
 * re-rendering the sheet on every keystroke to solve nothing.
 */
function syncHidden(form: HTMLFormElement | null) {
  if (!form) return;
  const date = form.elements.namedItem("occurredAtDate") as HTMLInputElement | null;
  const time = form.elements.namedItem("occurredAtTime") as HTMLInputElement | null;
  const hidden = form.elements.namedItem("occurredAt") as HTMLInputElement | null;
  if (!date || !hidden) return;
  hidden.value = `${date.value}T${time?.value || "00:00"}`;
}
