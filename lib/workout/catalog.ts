/**
 * Every exercise the Workout tab offers, in one place (brief §4 "운동 종류와 입력").
 *
 * Ids are stored; labels are only how they look, so renaming one never
 * rewrites history. There is deliberately no "자주 쓰는" chip and no "새 운동"
 * button — adding an exercise is a code change here (brief §4).
 *
 * The seven cardio kinds are carried over from PR #1 (`feat/south-america`,
 * `lib/south-america/config/cardio.ts`), ids unchanged, minus its free-text
 * "기타" name: a wheel-only form has nowhere to type one, so 기타 is just 기타.
 */

export type WorkoutKind = "cardio" | "strength" | "core" | "stretch";

export interface Exercise {
  id: string;
  label: string;
  emoji: string;
}

export const KINDS: readonly { id: WorkoutKind; label: string; emoji: string }[] = [
  { id: "cardio", label: "유산소", emoji: "🏃" },
  { id: "strength", label: "근력", emoji: "🏋️" },
  { id: "core", label: "복근·코어", emoji: "🔥" },
  { id: "stretch", label: "스트레칭", emoji: "🧘" },
];

export const CARDIO: readonly Exercise[] = [
  { id: "treadmill_run", label: "러닝머신 달리기", emoji: "🏃" },
  { id: "treadmill_walk", label: "러닝머신 걷기", emoji: "🚶" },
  { id: "incline_walk", label: "경사 걷기", emoji: "⛰️" },
  { id: "indoor_bike", label: "실내 사이클", emoji: "🚴" },
  { id: "outdoor_run", label: "야외 달리기", emoji: "🌳" },
  { id: "outdoor_walk", label: "야외 걷기", emoji: "👟" },
  { id: "other", label: "기타", emoji: "✨" },
];

export type StrengthCategory = "upper" | "glute" | "lower" | "back";

export const STRENGTH_CATEGORIES: readonly { id: StrengthCategory; label: string; emoji: string }[] = [
  { id: "upper", label: "상체", emoji: "💪" },
  { id: "glute", label: "엉덩이", emoji: "🍑" },
  { id: "lower", label: "하체", emoji: "🦵" },
  { id: "back", label: "등", emoji: "🪽" },
];

/** 21 strength exercises, by category (brief §4 "근력 21개"). */
export const STRENGTH: readonly (Exercise & { category: StrengthCategory })[] = [
  { id: "shoulder_press", label: "숄더 프레스", emoji: "💪", category: "upper" },
  { id: "arnold_press", label: "아놀드 프레스", emoji: "💪", category: "upper" },
  { id: "lateral_raise", label: "사레레", emoji: "💪", category: "upper" },
  { id: "bench_press", label: "벤치 프레스", emoji: "💪", category: "upper" },
  { id: "biceps_curl", label: "바이셉 컬", emoji: "💪", category: "upper" },
  { id: "triceps_pushdown", label: "트라이셉 푸시다운", emoji: "💪", category: "upper" },

  { id: "rdl", label: "RDL", emoji: "🍑", category: "glute" },
  { id: "single_rdl", label: "싱글 RDL", emoji: "🍑", category: "glute" },
  { id: "kettlebell_swing", label: "케틀벨 스윙", emoji: "🍑", category: "glute" },
  { id: "hip_thrust", label: "힙 쓰러스트", emoji: "🍑", category: "glute" },
  { id: "hip_abduction", label: "힙 어브덕션", emoji: "🍑", category: "glute" },
  { id: "deadlift", label: "데드리프트", emoji: "🍑", category: "glute" },

  { id: "leg_press", label: "레그프레스", emoji: "🦵", category: "lower" },
  { id: "smith_squat", label: "스쿼트(스미스)", emoji: "🦵", category: "lower" },
  { id: "goblet_squat", label: "고블릿 스쿼트", emoji: "🦵", category: "lower" },
  { id: "lunge", label: "런지", emoji: "🦵", category: "lower" },
  { id: "bulgarian_split_squat", label: "불가리안 스플릿 스쿼트", emoji: "🦵", category: "lower" },

  { id: "lat_pulldown", label: "랫풀다운", emoji: "🪽", category: "back" },
  { id: "seated_row", label: "시티드 로우", emoji: "🪽", category: "back" },
  { id: "barbell_row", label: "바벨 로우", emoji: "🪽", category: "back" },
  { id: "assisted_pullup", label: "풀업(어시스트)", emoji: "🪽", category: "back" },
];

export const CORE: readonly Exercise[] = [
  { id: "leg_raise", label: "레그 레이즈", emoji: "🔥" },
  { id: "crunch", label: "크런치", emoji: "🔥" },
  { id: "dead_bug", label: "데드버그", emoji: "🔥" },
];

export const STRETCH: readonly Exercise[] = [{ id: "stretch", label: "스트레칭", emoji: "🧘" }];

export const EXERCISES: Record<WorkoutKind, readonly Exercise[]> = {
  cardio: CARDIO,
  strength: STRENGTH,
  core: CORE,
  stretch: STRETCH,
};

export function isWorkoutKind(v: unknown): v is WorkoutKind {
  return KINDS.some((k) => k.id === v);
}

export function exerciseOf(kind: WorkoutKind, id: string): Exercise | null {
  return EXERCISES[kind].find((e) => e.id === id) ?? null;
}

export function exerciseLabel(kind: WorkoutKind, id: string): string {
  return exerciseOf(kind, id)?.label ?? id;
}

/** Any kind's exercise by id — ids are unique across the whole catalogue. */
export function findExercise(id: string): { kind: WorkoutKind; exercise: Exercise } | null {
  for (const k of KINDS) {
    const exercise = exerciseOf(k.id, id);
    if (exercise) return { kind: k.id, exercise };
  }
  return null;
}
