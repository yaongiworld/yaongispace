"use server";

import { revalidatePath } from "next/cache";
import { currentPersonId } from "@/lib/auth/current-person";
import { seoulParts } from "@/lib/calendar/dates";
import { createEvent, deleteEvent, updateEvent } from "@/lib/calendar/events";

/**
 * Creating, editing and deleting an Event.
 *
 * Server actions rather than a route handler: the calendar's whole write
 * surface is three verbs on one table, and a REST layer in front of that would
 * be indirection with no seam behind it.
 *
 * **The calendar is shared and these actions enforce no ownership**, because
 * there is none: either of us may edit or delete either of our Events, which
 * is what the ticket asks for and what the RLS policy in 002 already says. The
 * only thing the session is read for is *who is adding this*, which News uses
 * to show you the other person's doing.
 */

/** The signed-in Person, or a refusal. Every action starts here. */
async function requirePerson(): Promise<string> {
  const personId = await currentPersonId();
  if (!personId) {
    // Not an expected outcome on this page — the tab bar is behind sign-in —
    // so a throw is right. A refusal has its own page at the front door.
    throw new Error("서명되지 않은 요청이에요.");
  }
  return personId;
}

/**
 * A local datetime from the form, read as Seoul.
 *
 * `<input type="datetime-local">` yields "2026-08-22T19:30" with no zone, and
 * `new Date(...)` on that string uses the *runtime's* zone — UTC on Vercel. So
 * a 7:30pm Event entered on a phone in Seoul would be stored as 7:30pm UTC and
 * render as 4:30am the next day. The offset is applied explicitly instead.
 *
 * Seoul is +09:00 year-round and has no daylight saving, which is what makes a
 * fixed offset correct here rather than merely convenient.
 */
function seoulLocalToDate(local: string, allDay: boolean): Date {
  // An all-day thing has no clock time and the UI must not invent one, so it
  // is pinned to Seoul midnight rather than to whenever the form was opened.
  const value = allDay ? `${local.slice(0, 10)}T00:00` : local;
  return new Date(`${value}:00+09:00`);
}

/** Read the shared half of the create and edit forms. */
function readForm(form: FormData) {
  const title = String(form.get("title") ?? "").trim();
  if (!title) throw new Error("제목을 적어주세요.");

  const allDay = form.get("allDay") === "on";
  const occurredAtRaw = String(form.get("occurredAt") ?? "");
  if (!occurredAtRaw) throw new Error("날짜를 골라주세요.");

  const endsAtRaw = String(form.get("endsAt") ?? "");

  return {
    title,
    description: String(form.get("description") ?? "").trim() || null,
    occurredAt: seoulLocalToDate(occurredAtRaw, allDay),
    endsAt: endsAtRaw ? seoulLocalToDate(endsAtRaw, allDay) : null,
    allDay,
    /**
     * The entire recurrence feature: a checkbox.
     *
     * If a future session is about to add a frequency dropdown here, read the
     * ticket first — one yearly flag plus a date is the decision, and the
     * absence of RRULE is not an oversight.
     */
    repeatsYearly: form.get("repeatsYearly") === "on",
  };
}

export async function createEventAction(form: FormData): Promise<void> {
  const personId = await requirePerson();
  const input = readForm(form);

  if (input.endsAt && input.endsAt < input.occurredAt) {
    throw new Error("끝나는 시각이 시작보다 빨라요.");
  }

  await createEvent(personId, input);
  revalidatePath("/calendar");
}

export async function updateEventAction(form: FormData): Promise<void> {
  await requirePerson();
  const id = String(form.get("id") ?? "");
  if (!id) throw new Error("어떤 일정인지 알 수 없어요.");

  const input = readForm(form);
  if (input.endsAt && input.endsAt < input.occurredAt) {
    throw new Error("끝나는 시각이 시작보다 빨라요.");
  }

  await updateEvent(id, input);
  revalidatePath("/calendar");
}

export async function deleteEventAction(form: FormData): Promise<void> {
  await requirePerson();
  const id = String(form.get("id") ?? "");
  if (!id) throw new Error("어떤 일정인지 알 수 없어요.");

  await deleteEvent(id);
  revalidatePath("/calendar");
}

/**
 * Today in Seoul as `YYYY-MM-DD`, for the form's default date.
 *
 * On the server so that a phone with a wrong clock still gets Seoul's today,
 * which is the day the agenda opened on.
 */
export async function seoulTodayValue(): Promise<string> {
  const { year, month, day } = seoulParts(new Date());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
