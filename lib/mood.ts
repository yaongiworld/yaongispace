import type { NewsGroup } from "./news";

/**
 * What face the cat is wearing, and the one line under it.
 *
 * **The mood mirrors the top News item, with time of day as the fallback.**
 * That ordering is the whole point: the cat and the caption are rendered
 * together and must never contradict each other. A cat yawning at "편지가
 *왔어요!" reads as a bug in a way that is hard to name and impossible to
 * unsee, and it is exactly what happens if the face is chosen from the clock
 * while the words are chosen from the feed.
 *
 * So both come from here, from one decision, and the caption is derived from
 * the same item the face is. There is no second place that picks either.
 */

/**
 * The moods the cat has.
 *
 * These are the Fluent Emoji 3D cat faces (MIT), and they are **explicitly a
 * placeholder**. The real yaongi is being commissioned as an original —
 * `prototypes/pick-the-yaongi.html` is where these were compared, and its own
 * conclusion was that Fluent's cats are still Microsoft's drawings. The mood
 * *vocabulary* below is the part meant to survive: when the commissioned cat
 * lands it ships one drawing per name here and nothing else changes.
 *
 * No third-party character IP, ever — see CLAUDE.md. Anything whose licence
 * would stop this app being shown in Yangcho's MBA portfolio does not go here.
 */
export type Mood =
  /** A letter is waiting. Heart-eyes. */
  | "loving"
  /** Photos, a visit, a journey — something happened. */
  | "delighted"
  /** Something is coming up on the calendar. */
  | "expectant"
  /** An ordinary quiet daytime. */
  | "content"
  /** Quiet, and late. */
  | "sleepy";

/**
 * The drawing each mood renders as.
 *
 * Served from `public/yaongi`, which carries the MIT licence alongside — see
 * `public/yaongi/LICENSE-fluent-emoji.txt` for why these are placeholders and
 * what may replace them.
 */
export const MOOD_ASSET: Record<Mood, string> = {
  loving: "/yaongi/c_smile.png", // heart-eyes
  delighted: "/yaongi/c_grin.png",
  expectant: "/yaongi/c_joy.png",
  content: "/yaongi/c_wry.png",
  sleepy: "/yaongi/c_weary.png",
};

/** What the hearth shows: one face, one line. */
export interface Hearth {
  mood: Mood;
  /** The single quiet line beneath the cat. Korean, hardcoded. */
  caption: string;
  /** The News line the caption came from, if any. Null on a quiet day. */
  source: NewsGroup | null;
}

/**
 * Read the hearth from the feed.
 *
 * `now` is injectable because the fallback depends on the hour and a test that
 * could not choose the hour could not test it.
 */
export function hearthFor(groups: NewsGroup[], now: Date = new Date()): Hearth {
  const top = groups[0];
  if (!top) return quiet(now);

  const mood = moodFor(top);
  return { mood, caption: captionFor(top), source: top };
}

/**
 * A quiet day — the warm nothing.
 *
 * "조용한 하루". Never silence, and **never a prompt**. The distinction is the
 * point: "아직 아무 소식이 없어요. 편지를 써보세요!" is a nag, and a home
 * screen that nags is one you stop opening. A quiet day is a real state of a
 * real life, and the cat is simply pleased to see you.
 *
 * The face falls back to the hour here, and only here — there is no News item
 * to mirror, so there is nothing it can contradict.
 */
function quiet(now: Date): Hearth {
  const hour = seoulHour(now);
  // Late is late. The cat is as tired as we are.
  if (hour >= 23 || hour < 6) {
    return { mood: "sleepy", caption: "조용한 하루예요", source: null };
  }
  return { mood: "content", caption: "조용한 하루예요", source: null };
}

/** The face for a News line. */
function moodFor(group: NewsGroup): Mood {
  if (group.items[0].kind === "letter") return "loving";
  if (group.items.some((i) => i.imminent)) return "expectant";
  return "delighted";
}

/**
 * The one line beneath the cat.
 *
 * One sentence, always — the hearth is not a list. A group says how many, a
 * Letter says who wrote it, and nothing here is a call to action.
 *
 * We are 토위 and 양초 in the UI, never our legal names, and `personName` is
 * already the display name the database holds.
 */
function captionFor(group: NewsGroup): string {
  const [first] = group.items;
  const who = first.personName;
  const count = group.items.length;

  if (first.kind === "letter") {
    // 봉하다 is the verb for a Letter, never 보내다 — nothing is transmitted.
    return `${who}가 편지를 봉했어요`;
  }

  if (first.kind === "event") {
    return group.items.some((i) => i.imminent)
      ? `${who}의 일정이 다가와요`
      : `${who}가 일정을 추가했어요`;
  }

  // A Journey names itself: "제주, 10월에 사진 일곱 장" reads as a memory,
  // where "사진 7장" alone reads as a counter.
  const where = group.by === "journey" && group.journeyTitle
    ? `${group.journeyTitle}에 `
    : "";

  switch (first.kind) {
    case "photo":
      return `${who}가 ${where}사진 ${count}장을 올렸어요`;
    case "visit":
      return count > 1
        ? `${who}가 ${where}${count}곳을 다녀왔어요`
        : `${who}가 ${where}${first.title ?? "어딘가"}에 다녀왔어요`;
    case "place":
      return `${who}가 가보고 싶은 곳을 담아뒀어요`;
    case "note":
      return `${who}가 ${where}메모를 남겼어요`;
    case "journey":
      return `${who}가 ${first.title ?? "새로운 여정"}을 시작했어요`;
    default:
      return `${who}가 무언가를 남겼어요`;
  }
}

/** The hour in Seoul, pinned like every other date in the app. */
function seoulHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );
}
