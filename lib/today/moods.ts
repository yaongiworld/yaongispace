/**
 * The faces you can press for "how am I today".
 *
 * Six, so they sit in one row on a 320px phone at a comfortable 44px each.
 * The ids are stored (migration 009 mirrors this list in a check constraint);
 * the emoji and words are only how they look and can change freely.
 */
export const MOODS = [
  { id: "happy", emoji: "😊", label: "좋아" },
  { id: "excited", emoji: "🥰", label: "설레" },
  { id: "calm", emoji: "😌", label: "평온" },
  { id: "tired", emoji: "😪", label: "피곤" },
  { id: "sad", emoji: "🥲", label: "울적" },
  { id: "grumpy", emoji: "😤", label: "뿔남" },
] as const;

export type MoodId = (typeof MOODS)[number]["id"];

export const isMoodId = (v: unknown): v is MoodId => MOODS.some((m) => m.id === v);

export function moodOf(id: string | null | undefined) {
  return MOODS.find((m) => m.id === id) ?? null;
}
