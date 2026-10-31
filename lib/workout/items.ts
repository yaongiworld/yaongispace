/**
 * The cat's little rewards (brief §9 남은 5가지-3): twelve tiny accessories,
 * one more opening each time a person's workouts reach the next step. Shown
 * only inside the Yaongi sheet, and never as a level or a points number.
 *
 * Emoji until the image room draws them; each has its image id ready.
 */
export const ITEMS = [
  { id: "ribbon", emoji: "🎀", label: "리본", at: 1 },
  { id: "flower", emoji: "🌼", label: "꽃핀", at: 3 },
  { id: "scarf", emoji: "🧣", label: "스카프", at: 5 },
  { id: "glasses", emoji: "🕶️", label: "선글라스", at: 8 },
  { id: "cap", emoji: "🧢", label: "모자", at: 12 },
  { id: "backpack", emoji: "🎒", label: "배낭", at: 16 },
  { id: "headphones", emoji: "🎧", label: "헤드폰", at: 20 },
  { id: "sneakers", emoji: "👟", label: "운동화", at: 25 },
  { id: "tophat", emoji: "🎩", label: "신사 모자", at: 30 },
  { id: "medal", emoji: "🏅", label: "메달", at: 40 },
  { id: "crown", emoji: "👑", label: "왕관", at: 50 },
  { id: "balloon", emoji: "🎈", label: "풍선", at: 64 },
] as const;

export type Item = (typeof ITEMS)[number];

export const imageIdOf = (item: Item) => `item-${item.id}`;

export function unlockedItems(workoutCount: number): Item[] {
  return ITEMS.filter((i) => workoutCount >= i.at);
}

/** The item a save just opened, if the count crossed a step. */
export function newlyUnlocked(before: number, after: number): Item | null {
  return ITEMS.find((i) => before < i.at && after >= i.at) ?? null;
}
