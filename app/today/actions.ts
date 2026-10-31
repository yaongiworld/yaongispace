"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentPersonId } from "@/lib/auth/current-person";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { isLeaveMinute } from "@/lib/today/clock";
import { isDay, today } from "@/lib/today/day";
import { isMoodId } from "@/lib/today/moods";
import { markLeft, setLeaveMinute, setMemo, setMood, unmarkLeft } from "@/lib/today/store";

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
  await setMemo(await me(), day && isDay(day) ? day : today(), String(body ?? ""));
  refresh();
}

/** The one setting that does something: leave this phone. */
export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/sign-in");
}
