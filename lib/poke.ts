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

/** 💗 보고싶다 (migration 012): a 콕's softer sibling, once a day. */
export const MISS_ENABLED = true;
export const MISSES_PER_DAY = 1;

export type PokeKind = "poke" | "miss";
const LIMIT: Record<PokeKind, number> = { poke: POKES_PER_DAY, miss: MISSES_PER_DAY };

/** How many of a kind I have left today. */
export async function pokesLeft(
  client: PoolClient,
  meId: string,
  day: Day,
  kind: PokeKind = "poke",
): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM poke WHERE from_person = $1 AND day = $2 AND kind = $3",
    [meId, day, kind],
  );
  return Math.max(0, LIMIT[kind] - rows[0].n);
}

/** Send one. Returns how many are left, or null when today's are used. */
export async function sendPoke(
  meId: string,
  toId: string,
  day: Day,
  kind: PokeKind = "poke",
): Promise<number | null> {
  try {
    return await asPerson(meId, async (client) => {
      await client.query("INSERT INTO poke (from_person, to_person, day, kind) VALUES ($1, $2, $3, $4)", [
        meId,
        toId,
        day,
        kind,
      ]);
      return pokesLeft(client, meId, day, kind);
    });
  } catch (error) {
    if (error instanceof Error && /limit reached for today/.test(error.message)) return null;
    throw error;
  }
}
