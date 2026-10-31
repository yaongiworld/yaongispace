"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentPersonId } from "@/lib/auth/current-person";
import { asPerson } from "@/lib/as-person";
import { createEvent } from "@/lib/calendar/events";
import { isDay } from "@/lib/today/day";

/**
 * Anniversaries from a Moments day card. They are ordinary Events — the
 * table, the yearly-repeat rule and the old agenda all stay as they were
 * (충돌 2) — written as all-day on the Seoul date.
 */

export async function addAnniversary(day: string, title: string, yearly: boolean): Promise<void> {
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");
  const name = String(title ?? "").trim().slice(0, 40);
  if (!isDay(day) || !name) return;

  await createEvent(personId, {
    title: name,
    occurredAt: new Date(`${day}T00:00:00+09:00`),
    allDay: true,
    repeatsYearly: Boolean(yearly),
  });
  revalidatePath("/moments");
  revalidatePath("/calendar");
}

export async function removeAnniversary(id: string): Promise<void> {
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return;
  // Only all-day things — the anniversaries this card makes — and as the
  // signed-in person, so RLS applies. A timed Event from the old agenda is
  // not this card's to remove. A yearly one goes for every year: it is one row.
  await asPerson(personId, (c) => c.query("DELETE FROM event WHERE id = $1 AND all_day", [id]));
  revalidatePath("/moments");
  revalidatePath("/calendar");
}
