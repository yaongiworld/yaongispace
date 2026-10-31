import type { PoolClient } from "pg";

/**
 * The two of us, as the couple app sees us: which Person is 양초 and which is
 * 토위, and which one is looking.
 *
 * 양초 is coral and on the left, 토위 is sky-blue and on the right — everywhere,
 * whoever is signed in (brief §9, 2026-11-01). So every screen asks this once
 * and lays itself out by `yangcho`/`towee`, never by "me"/"you".
 */

export type Cat = "yangcho" | "towee";

export const CATS: readonly Cat[] = ["yangcho", "towee"];

export interface Partner {
  id: string;
  /** Always 양초 or 토위 — "We are 토위 and 양초 in the UI" (CLAUDE.md),
   *  whatever name the Google account brought with it. */
  name: string;
  cat: Cat;
}

export interface Couple {
  yangcho: Partner | null;
  towee: Partner | null;
  /** The signed-in one. */
  me: Partner;
  /** The other one, or null before the second of us has ever signed in. */
  partner: Partner | null;
  /**
   * Whether the signed-in person's cat is *stored* (person.cat) rather than
   * guessed. False shows the one-time "나는 누구예요?" welcome on Today.
   */
  claimed: boolean;
}

/** How each of us is named everywhere in the app. */
export const CAT_NAME: Record<Cat, string> = { yangcho: "양초", towee: "토위" };

interface PersonRow {
  id: string;
  display_name: string;
  cat: Cat | null;
}

/**
 * Resolve the couple from the `person` rows.
 *
 * `person.cat` is the answer (migration 009). A row without one falls back to
 * its display name, and only then to sign-up order — 양초 first — so a fresh
 * database still renders rather than refusing to. A guess is only a guess:
 * `claimed` says so, and Today asks once (`claim_cat`).
 */
export function resolveCouple(rows: PersonRow[], meId: string): Couple {
  const byCat: Partial<Record<Cat, Partner>> = {};
  const unplaced: PersonRow[] = [];

  for (const row of rows) {
    const cat =
      row.cat ??
      (row.display_name === "양초" ? "yangcho" : row.display_name === "토위" ? "towee" : null);
    if (cat && !byCat[cat]) byCat[cat] = { id: row.id, name: CAT_NAME[cat], cat };
    else unplaced.push(row);
  }
  for (const row of unplaced) {
    const cat = CATS.find((c) => !byCat[c]);
    if (!cat) break;
    byCat[cat] = { id: row.id, name: CAT_NAME[cat], cat };
  }

  const all = CATS.map((c) => byCat[c]).filter((p): p is Partner => Boolean(p));
  const me = all.find((p) => p.id === meId);
  if (!me) throw new Error("the signed-in person is not one of the two of us");

  return {
    yangcho: byCat.yangcho ?? null,
    towee: byCat.towee ?? null,
    me,
    partner: all.find((p) => p.id !== meId) ?? null,
    claimed: rows.some((r) => r.id === meId && r.cat !== null),
  };
}

export async function loadCouple(client: PoolClient, meId: string): Promise<Couple> {
  const { rows } = await client.query<PersonRow>(
    "SELECT id, display_name, cat FROM person ORDER BY created_at, id",
  );
  return resolveCouple(rows, meId);
}

/** Which cat a Person id belongs to, or null. */
export function catOf(couple: Couple, personId: string): Cat | null {
  if (couple.yangcho?.id === personId) return "yangcho";
  if (couple.towee?.id === personId) return "towee";
  return null;
}
