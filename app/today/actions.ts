"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asPerson } from "@/lib/as-person";
import { currentPersonId } from "@/lib/auth/current-person";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { loadCouple } from "@/lib/couple";
import { POKE_ENABLED, sendPoke } from "@/lib/poke";
import { isLeaveMinute } from "@/lib/today/clock";
import { isDay, today } from "@/lib/today/day";
import { isMoodId } from "@/lib/today/moods";
import { addProtein, markLeft, moveMemo, setLeaveMinute, setMemo, setMood, unmarkLeft } from "@/lib/today/store";

/**
 * Today's writes. Each one is about *today* in Seoul and about the signed-in
 * person only — nobody sets the other one's face or clock.
 */

async function me(): Promise<string> {
  const id = await currentPersonId();
  if (!id) redirect("/sign-in");
  return id;
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/moments");
}

export async function chooseMood(mood: string): Promise<void> {
  if (!isMoodId(mood)) return;
  await setMood(await me(), today(), mood);
  refresh();
}

export async function chooseLeaveTime(minute: number): Promise<void> {
  if (!isLeaveMinute(minute)) return;
  await setLeaveMinute(await me(), today(), minute);
  refresh();
}

export async function leftWork(): Promise<void> {
  await markLeft(await me(), today());
  refresh();
}

export async function undoLeftWork(): Promise<void> {
  await unmarkLeft(await me(), today());
  refresh();
}

/**
 * Which day a write is for. No day means today. A day that is given is used
 * as it is, or the write is refused: a bad or future day must never quietly
 * become today, or a Moments card for tomorrow would overwrite today's line.
 */
function dayFor(day: string | undefined): string | null {
  if (day === undefined) return today();
  return isDay(day) && day <= today() ? day : null;
}

export async function saveMemo(body: string, day?: string): Promise<boolean> {
  const target = dayFor(day);
  if (!target) return false;
  await setMemo(await me(), target, String(body ?? ""));
  refresh();
  return true;
}

/** Move my line from one day to another (both today or earlier). */
export async function moveMyMemo(from: string, to: string): Promise<"moved" | "taken" | "missing" | "bad"> {
  const a = dayFor(from);
  const b = dayFor(to);
  if (!a || !b || a === b) return "bad";
  const result = await moveMemo(await me(), a, b);
  refresh();
  return result;
}

/** 🥚 +1 for today, or −1 from a Moments day card. Never a future day. */
export async function countProtein(delta: number, day?: string): Promise<number | null> {
  const target = dayFor(day);
  if ((delta !== 1 && delta !== -1) || !target) return null;
  const n = await addProtein(await me(), target, delta);
  refresh();
  return n;
}

/** 콕: tap the other one's cat. Returns how many are left today, or null at three. */
export async function pokePartner(): Promise<number | null> {
  const meId = await me();
  if (!POKE_ENABLED) return null;
  const partnerId = await asPerson(meId, async (c) => (await loadCouple(c, meId)).partner?.id ?? null);
  if (!partnerId) return null;
  const left = await sendPoke(meId, partnerId, today());
  revalidatePath("/");
  return left;
}

/** The one-time welcome: "나는 양초 / 토위예요". See claim_cat in 009. */
export async function claimCat(cat: string): Promise<void> {
  if (cat !== "yangcho" && cat !== "towee") return;
  const personId = await me();
  await asPerson(personId, (c) => c.query("SELECT claim_cat($1)", [cat]));
  revalidatePath("/", "layout");
}

/** The one setting that does something: leave this phone. */
export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/sign-in");
}
