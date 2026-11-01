import type { PoolClient } from "pg";
import { asPerson } from "@/lib/as-person";
import type { Cat, Couple } from "@/lib/couple";
import type { Day } from "./day";

/**
 * 오늘 운동각? — the old Baby Steps without the timetable (migration 013).
 * Say whether today is a workout day; on one, tick four ready steps. Only
 * 챙기기 and 출발 are rewarded (D-181), as progress toward the cat's items.
 */

import { REWARDED, STEPS, type Plan, type StepId } from "./steps";

export { REWARDED, STEPS, isStepId, type Plan, type StepId } from "./steps";

export interface ReadyOf {
  plan: Plan | null;
  steps: StepId[];
}

/** Both people's plan and ticked steps for a day, by cat. */
export async function readyFor(client: PoolClient, couple: Couple, day: Day): Promise<Record<Cat, ReadyOf>> {
  const plans = await client.query<{ person_id: string; choice: Plan }>(
    "SELECT person_id, choice FROM day_plan WHERE day = $1",
    [day],
  );
  const steps = await client.query<{ person_id: string; step: StepId }>(
    "SELECT person_id, step FROM day_step WHERE day = $1",
    [day],
  );
  const of = (id: string | undefined): ReadyOf => ({
    plan: plans.rows.find((r) => r.person_id === id)?.choice ?? null,
    steps: STEPS.map((s) => s.id).filter((s) => steps.rows.some((r) => r.person_id === id && r.step === s)),
  });
  return { yangcho: of(couple.yangcho?.id), towee: of(couple.towee?.id) };
}

/** Choose 🏋️ / 😴, or clear the choice with null. */
export async function setPlan(personId: string, day: Day, plan: Plan | null): Promise<void> {
  await asPerson(personId, (c) =>
    plan
      ? c.query(
          `INSERT INTO day_plan (person_id, day, choice) VALUES ($1, $2, $3)
           ON CONFLICT (person_id, day) DO UPDATE SET choice = excluded.choice, updated_at = now()`,
          [personId, day, plan],
        )
      : c.query("DELETE FROM day_plan WHERE person_id = $1 AND day = $2", [personId, day]),
  );
}

/** Tick or untick a step. Returns whether it is ticked now. */
export async function setStep(personId: string, day: Day, step: StepId, done: boolean): Promise<boolean> {
  return asPerson(personId, async (c) => {
    if (done) {
      await c.query(
        "INSERT INTO day_step (person_id, day, step) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [personId, day, step],
      );
    } else {
      await c.query("DELETE FROM day_step WHERE person_id = $1 AND day = $2 AND step = $3", [personId, day, step]);
    }
    return done;
  });
}

/**
 * What the cat's items count: every workout, plus each 챙기기 and 출발
 * ticked (once per day each — the primary key sees to that). Unticking one
 * takes it back, and an item it opened locks again (D-188).
 */
export async function rewardCount(client: PoolClient, personId: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `SELECT (SELECT count(*) FROM workout WHERE person_id = $1)
          + (SELECT count(*) FROM day_step WHERE person_id = $1 AND step = ANY($2)) AS n`,
    [personId, REWARDED],
  );
  return Number(rows[0].n);
}
