"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentPersonId } from "@/lib/auth/current-person";
import { reviseLetter, sealLetter, theOtherPerson } from "@/lib/letters";

/**
 * 봉하기 — the ceremony.
 *
 * The verb is sealing, never sending. Nothing is transmitted: both of us read
 * the same archive and always did, so there is no outbox and nothing in
 * flight. What changes when you seal a letter is that it is finished — and
 * finishing it is the whole ritual the section exists for.
 *
 * These run on the server and take the Person from the session cookie, never
 * from the form. An author id in a hidden field would be a letter you could
 * sign with somebody else's name; RLS would refuse it anyway
 * (`letter_written_by_author`), but the app should not be composing the
 * attempt in the first place.
 */

/** A date input gives "2036-01-01"; a sealed letter opens at midnight in Seoul. */
function unsealAtFromForm(value: FormDataEntryValue | null): string | null {
  const date = typeof value === "string" ? value.trim() : "";
  if (!date) return null;
  // +09:00 explicitly. Left to the server's zone this would unseal at 09:00
  // Korean time, or the day before — a surprise arriving on the wrong day.
  return `${date}T00:00:00+09:00`;
}

export async function seal(formData: FormData): Promise<void> {
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");

  const body = String(formData.get("body") ?? "");
  if (!body.trim()) {
    // An empty letter is not a letter. The form keeps you here.
    redirect("/letters/write?빈편지=1");
  }

  const other = await theOtherPerson(personId);
  if (!other) throw new Error("편지를 받을 사람이 없어요");

  const id = await sealLetter(personId, other.id, {
    title: String(formData.get("title") ?? ""),
    body,
    unsealAt: unsealAtFromForm(formData.get("unseal_on")),
  });

  revalidatePath("/letters");
  redirect(`/letters/${id}`);
}

export async function revise(formData: FormData): Promise<void> {
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");

  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "");
  if (!id) throw new Error("어떤 편지인지 알 수 없어요");
  if (!body.trim()) redirect(`/letters/${id}/edit?빈편지=1`);

  // If it has been read since this form was opened, the database refuses and
  // that refusal is correct — the recipient has already seen these words.
  await reviseLetter(personId, id, {
    title: String(formData.get("title") ?? ""),
    body,
    unsealAt: unsealAtFromForm(formData.get("unseal_on")),
  });

  revalidatePath("/letters");
  revalidatePath(`/letters/${id}`);
  redirect(`/letters/${id}`);
}
