/**
 * The faces you can press for "how am I today".
 *
 * Six, so they sit in two rows of three on a 320px phone, comfortably over 44px.
 * The ids are stored (migration 009 mirrors this list in a check constraint);
 * the emoji and words are only how they look and can change freely.
 */
export const MOODS = [
  { id: "happy", emoji: "😊", face: "😸", label: "좋아" },
  { id: "excited", emoji: "🥰", face: "😻", label: "설레" },
  { id: "calm", emoji: "😌", face: "😽", label: "평온" },
  { id: "tired", emoji: "😪", face: "🙀", label: "피곤" },
  { id: "sad", emoji: "🥲", face: "😿", label: "울적" },
  { id: "grumpy", emoji: "😤", face: "😾", label: "뿔남" },
] as const;

/**
 * The cat's own face for a mood — what Today shows *as* the cat, so the cat
 * itself looks how you feel. 🐱 until a face is pressed. The image room swaps
 * these for drawings by `cat-face-<who>-<mood>` (brief §6, 충돌 4).
 */
export function catFace(mood: string | null | undefined): string {
  return MOODS.find((m) => m.id === mood)?.face ?? "🐱";
}

export type MoodId = (typeof MOODS)[number]["id"];

export const isMoodId = (v: unknown): v is MoodId => MOODS.some((m) => m.id === v);

export function moodOf(id: string | null | undefined) {
  return MOODS.find((m) => m.id === id) ?? null;
}
