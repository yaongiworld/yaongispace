"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asPerson } from "@/lib/as-person";
import { currentPersonId } from "@/lib/auth/current-person";
import { loadCouple } from "@/lib/couple";
import { CURRENT_ERA_ID, PASSPORT_TRAILS } from "@/lib/era/eras";
import { completionChange } from "@/lib/era/passport";
import { eraTotals } from "@/lib/era/store";
import { newlyUnlocked } from "@/lib/workout/items";
import { parseWorkoutInput } from "@/lib/workout/input";
import { addWorkout, deleteWorkout, updateWorkout } from "@/lib/workout/store";
import { rewardCount } from "@/lib/today/ready";
import { today } from "@/lib/today/day";

/**
 * Workout writes. What comes back is only what a save *earned* — a new item
 * for the cat, a trail finished — so the screen can celebrate it.
 */

export interface Saved {
  ok: boolean;
  /** The emoji and name of an item this save opened, for whoever's workout it was. */
  item?: { emoji: string; label: string };
  /** Trails this save finished, as "🏛️ 마추픽추". */
  trails?: string[];
}

async function me(): Promise<string> {
  const id = await currentPersonId();
  if (!id) redirect("/sign-in");
  return id;
}

function refresh() {
  revalidatePath("/workout");
  revalidatePath("/era");
  revalidatePath("/moments");
  revalidatePath("/");
}

/** Snapshot what a save could change: the owner's count and the era's metres. */
async function snapshot(meId: string, ownerId: string) {
  return asPerson(meId, async (client) => {
    const couple = await loadCouple(client, meId);
    if (![couple.yangcho?.id, couple.towee?.id].includes(ownerId)) return null;
    return {
      count: await rewardCount(client, ownerId),
      eraM: (await eraTotals(client, couple, CURRENT_ERA_ID)).totalM,
    };
  });
}

function earned(before: { count: number; eraM: number }, after: { count: number; eraM: number }): Saved {
  const item = newlyUnlocked(before.count, after.count);
  const change = completionChange(before.eraM, after.eraM);
  return {
    ok: true,
    item: item ? { emoji: item.emoji, label: item.label } : undefined,
    trails: change.trailsGained.length
      ? change.trailsGained.map((e) => {
          const t = PASSPORT_TRAILS[e.trailIndex];
          return `${t.emoji} ${t.label}`;
        })
      : undefined,
  };
}

export async function saveWorkout(raw: unknown): Promise<Saved> {
  const meId = await me();
  const input = parseWorkoutInput(raw);
  // Nothing from the future: it would walk an era forward on a day that has not happened.
  if (!input || input.day > today()) return { ok: false };

  const before = await snapshot(meId, input.personId);
  if (!before) return { ok: false };
  await addWorkout(meId, input);
  const after = await snapshot(meId, input.personId);
  refresh();
  return earned(before, after!);
}

export async function fixWorkout(id: string, raw: unknown): Promise<Saved> {
  const meId = await me();
  const input = parseWorkoutInput(raw);
  if (!input || typeof id !== "string" || input.day > today()) return { ok: false };

  const before = await snapshot(meId, input.personId);
  if (!before) return { ok: false };
  const updated = await updateWorkout(meId, id, input);
  const after = await snapshot(meId, input.personId);
  refresh();
  return updated ? { ...earned(before, after!), item: undefined } : { ok: false };
}

export async function removeWorkout(id: string): Promise<void> {
  if (typeof id !== "string") return;
  await deleteWorkout(await me(), id);
  refresh();
}
