/**
 * The ready steps, safe to import from the browser (no database here —
 * lib/today/ready.ts holds the queries). The old prototype's Baby Steps
 * (02_DECISIONS D-150, P-080); only 챙기기 and 출발 are rewarded (D-181).
 */

export type Plan = "go" | "rest";

export const STEPS = [
  { id: "pack", emoji: "👕", label: "운동복 챙기기", rewarded: true },
  { id: "fuel", emoji: "🥚", label: "단백질·간식", rewarded: false },
  { id: "change", emoji: "🔄", label: "환복", rewarded: false },
  { id: "depart", emoji: "🚶", label: "출발", rewarded: true },
] as const;

export type StepId = (typeof STEPS)[number]["id"];
export const isStepId = (v: unknown): v is StepId => STEPS.some((s) => s.id === v);
export const REWARDED: readonly StepId[] = STEPS.filter((s) => s.rewarded).map((s) => s.id);
