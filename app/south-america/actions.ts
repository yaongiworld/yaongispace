"use server";

import { currentPersonId } from "@/lib/auth/current-person";
import { getSnapshot, runDayCommand, runLogCommand } from "@/lib/south-america/server/store";
import type {
  DayCommandOutcome,
  DayEnvelope,
  LogCommandOutcome,
  LogEnvelope,
  Refusal,
  Snapshot,
} from "@/lib/south-america/server/wire";

/**
 * What the phone calls. All three take the Person from the session cookie,
 * never from the arguments: "who did this" is decided here, so a request body
 * cannot sign a change as the other one of us.
 *
 * A signed-out caller gets a refusal value rather than a redirect, because the
 * phone may be mid-queue offline-then-online and needs to keep its pending
 * changes while it shows a sign-in prompt.
 */

export async function fetchSnapshot(): Promise<Snapshot | Refusal> {
  const personId = await currentPersonId();
  if (!personId) return { ok: false, reason: "signed_out" };
  const snapshot = await getSnapshot(personId);
  return snapshot ?? { ok: false, reason: "not_member" };
}

export async function sendDay(env: DayEnvelope): Promise<DayCommandOutcome | Refusal> {
  const personId = await currentPersonId();
  if (!personId) return { ok: false, reason: "signed_out" };
  if (typeof env?.cid !== "string" || env.cid.length === 0 || env.cid.length > 100) {
    return { ok: false, reason: "bad_command" };
  }
  return runDayCommand(personId, env.cmd, new Date(), { cid: env.cid, clientAt: env.at });
}

export async function sendLog(env: LogEnvelope): Promise<LogCommandOutcome | Refusal> {
  const personId = await currentPersonId();
  if (!personId) return { ok: false, reason: "signed_out" };
  return runLogCommand(personId, env.cmd, new Date(), { cid: env.cid, clientAt: env.at });
}
