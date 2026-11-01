/**
 * The travel eras, and South America's five hiking-passport trails.
 *
 * Carried over from the old prototype (`south-america-prototype/src/config/
 * passport.ts`, user-confirmed 2026-10-18): five trails, 36.5km a lap. Names
 * and order are fixed; distances are metres on the 0.1km grid so they add up
 * exactly with stored cardio. The Korean `label` is new — it is what the Era
 * cards show (brief §4 Era).
 */

export type PassportTrail = {
  /** A fixed id. */
  id: string;
  /** The official English name. */
  name: string;
  /** A short display name. */
  shortName: string;
  /** What the Era card says. */
  label: string;
  emoji: string;
  /** This trail's target distance, in metres. */
  distanceM: number;
};

export const PASSPORT_TRAILS: readonly PassportTrail[] = [
  { id: "machu_picchu", name: "Machu Picchu", shortName: "Machu Picchu", label: "마추픽추", emoji: "🏛️", distanceM: 1500 },
  { id: "mirador_base_torres", name: "Mirador Base Torres", shortName: "Base Torres", label: "미라도르 토레스", emoji: "🏔️", distanceM: 20000 },
  { id: "laguna_capri", name: "Laguna Capri", shortName: "Laguna Capri", label: "라구나 카프리", emoji: "🏞️", distanceM: 8000 },
  { id: "chorrillo_del_salto", name: "Chorrillo del Salto", shortName: "Chorrillo", label: "초리요 델 살토", emoji: "💧", distanceM: 3000 },
  { id: "perito_moreno_minitrekking", name: "Perito Moreno Glacier Minitrekking", shortName: "Perito Moreno", label: "페리토 모레노", emoji: "🧊", distanceM: 4000 },
] as const;

/** Trails in one lap. */
export const TRAILS_PER_LAP = PASSPORT_TRAILS.length;

/** One lap, in metres = 36,500. */
export const LAP_M: number = PASSPORT_TRAILS.reduce((sum, t) => sum + t.distanceM, 0);

/** Cumulative finish lines within a lap: 1,500 / 21,500 / 29,500 / 32,500 / 36,500. */
export const LAP_THRESHOLDS_M: readonly number[] = PASSPORT_TRAILS.map((_, i) =>
  PASSPORT_TRAILS.slice(0, i + 1).reduce((s, t) => s + t.distanceM, 0),
);

/**
 * Every era the Era tab lists. Only South America is open; the rest hold
 * their place (brief §4 Era — how the next one opens is for later).
 */
export const ERAS = [
  { id: "south_america", label: "남미", emoji: "🌎", open: true },
  { id: "norway", label: "노르웨이", emoji: "🇳🇴", open: false },
  { id: "japan", label: "일본", emoji: "🗾", open: false },
] as const;

/** The era new cardio walks toward. */
export const CURRENT_ERA_ID = "south_america";
