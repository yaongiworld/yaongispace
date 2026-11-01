import type { NewsGroup } from "@/lib/news";
import { hearthFor } from "@/lib/mood";
import { today } from "./day";

/**
 * The one line the Today cat says (brief §4, 충돌 1 and 6).
 *
 * In order:
 *   1. a Letter that arrived since you last looked — a letter is the one
 *      piece of news always worth its own sentence (CLAUDE.md), so it is
 *      never pushed out by a mood tapped five minutes later, nor by the day
 *      turning over before you opened the app;
 *   2. a day both of us moved — the one thing worth a cheer;
 *   3. today's News, letters and imminent events first, then a workout
 *      written for you, then clocks;
 *   4. a day both of us pressed a face (it outranks the other one's mood
 *      news, which would otherwise say the same thing by halves);
 *   5. today's mood news;
 *   6. if the other one has not pressed a face yet, a gentle guess for them
 *      — never a prompt, never a red dot;
 *   7. the warm nothing.
 */
export function catLine({
  groups,
  seenAt,
  quietPartner,
  together = { moods: false, moved: false },
  now = new Date(),
}: {
  /** Whether both of us pressed a face / logged a workout today. */
  together?: { moods: boolean; moved: boolean };
  groups: NewsGroup[];
  /** When this person last looked at News, read *before* marking it seen. */
  seenAt: Date | null;
  /** The other one's name when their face is still empty today. */
  quietPartner: string | null;
  now?: Date;
}): string {
  const letter = groups.find(
    (g) => g.items[0].kind === "letter" && (!seenAt || g.arrivedAt > seenAt),
  );
  if (letter) return hearthFor([letter], now).caption;
  if (together.moved) return "💪 오늘 둘 다 운동했어요!";

  const day = today(now);
  const fresh = groups
    .filter((g) => today(g.arrivedAt) === day)
    .map((g, i) => ({ g, i, rank: rank(g) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.g);
  const news = fresh.filter((g) => g.items[0].kind !== "mood");
  if (news.length > 0) return hearthFor(news, now).caption;
  if (together.moods) return "💞 오늘 둘 다 기분을 남겼어요";
  if (fresh.length > 0) return hearthFor(fresh, now).caption;

  if (quietPartner) return `${quietPartner}는 아직 바쁜가 봐요`;
  return hearthFor([], now).caption;
}

function rank(g: NewsGroup): number {
  const first = g.items[0];
  if (first.kind === "letter") return 0;
  if (g.items.some((i) => i.imminent)) return 1;
  if (first.kind === "workout_for" || first.kind === "poke") return 2;
  if (first.kind === "mood" || first.kind === "offwork") return 4;
  return 3;
}
