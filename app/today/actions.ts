"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asPerson } from "@/lib/as-person";
import { currentPersonId } from "@/lib/auth/current-person";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { isLeaveMinute } from "@/lib/today/clock";
import { isDay, today } from "@/lib/today/day";
import { isMoodId } from "@/lib/today/moods";
import { addProtein, markLeft, setLeaveMinute, setMemo, setMood, unmarkLeft } from "@/lib/today/store";

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

export async function saveMemo(body: string, day?: string): Promise<void> {
  // A day card in Moments may write any past day; never a future one.
  const target = day && isDay(day) && day <= today() ? day : today();
  await setMemo(await me(), target, String(body ?? ""));
  refresh();
}

/** 🥚 +1 for today, or −1 from a Moments day card. Never a future day. */
export async function countProtein(delta: number, day?: string): Promise<number> {
  if (delta !== 1 && delta !== -1) return 0;
  const target = day && isDay(day) && day <= today() ? day : today();
  const n = await addProtein(await me(), target, delta);
  refresh();
  return n;
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
