import type { PoolClient } from "pg";
import type { Cat, Couple } from "@/lib/couple";

/**
 * How far each era has walked: the sum of its cardio, from the workout table.
 * Nothing is stored — log, fix or delete a run and the Era tab follows
 * (the same rule the prototype passport kept).
 *
 * Solo cardio counts too (brief §4 Era "혼자 한 유산소도 합쳐요"), and an era
 * only counts the kilometres written toward it.
 */
export interface EraTotals {
  totalM: number;
  byCat: Record<Cat, number>;
  count: number;
}

export async function eraTotals(
  client: PoolClient,
  couple: Couple,
  eraId: string,
): Promise<EraTotals> {
  const { rows } = await client.query<{ person_id: string; m: string; n: number }>(
    `SELECT person_id, sum(distance_m) AS m, count(*)::int AS n
       FROM workout
      WHERE kind = 'cardio' AND era_id = $1
      GROUP BY person_id`,
    [eraId],
  );
  const byCat: Record<Cat, number> = { yangcho: 0, towee: 0 };
  let totalM = 0;
  let count = 0;
  for (const r of rows) {
    const m = Number(r.m);
    totalM += m;
    count += r.n;
    if (r.person_id === couple.yangcho?.id) byCat.yangcho += m;
    if (r.person_id === couple.towee?.id) byCat.towee += m;
  }
  return { totalM, byCat, count };
}
