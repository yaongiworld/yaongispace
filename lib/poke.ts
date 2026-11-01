import type { PoolClient } from "pg";
import { asPerson } from "@/lib/as-person";
import type { Day } from "@/lib/today/day";

/**
 * 콕 찌르기 (brief §9 남은 5가지-2): tap the other one's cat; their Today cat
 * says so next time they open the app. Three a day, no push.
 *
 * `POKE_ENABLED` is the PO's off switch ("압박으로 느껴지면 뺄 수 있어요"):
 * false hides the gesture and the line; the table and its history stay.
 */
export const POKE_ENABLED = true;
export const POKES_PER_DAY = 3;

/** How many 콕 I have left today. */
export async function pokesLeft(client: PoolClient, meId: string, day: Day): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM poke WHERE from_person = $1 AND day = $2",
    [meId, day],
  );
  return Math.max(0, POKES_PER_DAY - rows[0].n);
}

/** Send one. Returns how many are left, or null when today's three are used. */
export async function sendPoke(meId: string, toId: string, day: Day): Promise<number | null> {
  try {
    return await asPerson(meId, async (client) => {
      await client.query("INSERT INTO poke (from_person, to_person, day) VALUES ($1, $2, $3)", [meId, toId, day]);
      return pokesLeft(client, meId, day);
    });
  } catch (error) {
    if (error instanceof Error && /three pokes a day/.test(error.message)) return null;
    throw error;
  }
}
