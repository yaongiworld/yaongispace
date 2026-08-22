import { redirect } from "next/navigation";
import { currentPersonId } from "@/lib/auth/current-person";
import { newsFor, seeNews, type NewsGroup } from "@/lib/news";
import { hearthFor } from "@/lib/mood";
import { koreanRelative } from "@/lib/korean-date";
import { Yaongi } from "./Yaongi";

/**
 * 홈 — the hearth.
 *
 * The hero cat upper-centre, and beneath it one quiet line about what the
 * other one of us has been up to. That is the whole page.
 *
 * **There is no shortcut grid here and there must not be one.** It duplicated
 * the tab bar and would push the cat below the fold; dropping it is what freed
 * the sixth tab slot for the calendar. If a future session is tempted, read
 * CLAUDE.md, "Home is a hearth, not a dashboard".
 *
 * The rest of the feed sits under that first line, quieter — News collapses,
 * so this is a handful of lines rather than a scroll, and it is a rolling ~30
 * days rather than a history. The timeline, the Journey and Recall are where
 * history lives.
 *
 * This page does not use `SectionPage`. Its siblings are titled documents; the
 * hearth has no heading at all — "홈" over a cat would be labelling the room
 * you are standing in.
 */

export const metadata = {
  title: "야옹이월드",
};

// News is a live reading of the Entry index, so this page is never cached.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");

  const groups = await newsFor(personId);
  const hearth = hearthFor(groups);

  /**
   * Looking at the hearth is what marks News seen.
   *
   * Deliberately after the feed is read, not before: marking first and then
   * rendering would dismiss news that a failed render never showed. This is
   * the only write the home page performs, and it moves one timestamp.
   *
   * It does **not** touch any Letter. Seeing a letter mentioned here is not
   * reading it — only opening the Letter itself seals it, and a read Letter is
   * immutable, so conflating the two would permanently lock letters their
   * author could still have fixed.
   */
  await seeNews(personId);

  // The first line is the cat's caption, so it is never repeated below it.
  const rest = groups.slice(1);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pt-12 pb-28">
      <Yaongi mood={hearth.mood} />

      {/* The single quiet line. On a quiet day this is the warm nothing —
          never silence, and never a prompt. */}
      <p
        className="text-center text-lg text-clay-ink"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {hearth.caption}
      </p>

      {rest.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rest.map((group) => (
            <li key={group.key}>
              <NewsLine group={group} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/**
 * One more thing that happened, under the first.
 *
 * Not a link. News is a feed of what the other one has been up to, and the tab
 * bar is what navigates — a row of tappable cards here would rebuild the
 * shortcut grid by another name. What a line does is tell you; where you go
 * about it is your business.
 */
function NewsLine({ group }: { group: NewsGroup }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 px-5 py-3"
      style={{
        background: "var(--color-clay-card-quiet)",
        borderRadius: "var(--radius-clay)",
        boxShadow: "var(--shadow-clay)",
      }}
    >
      <span className="text-sm text-clay-ink">{lineFor(group)}</span>
      {/* Relative for the recent past, which is all this window holds. */}
      <span className="shrink-0 text-xs text-clay-ink-soft">
        {koreanRelative(group.arrivedAt)}
      </span>
    </div>
  );
}

/**
 * The words for a News line.
 *
 * Shorter than the cat's caption — that one is the sentence, these are the
 * footnotes — but the same vocabulary. 봉하다 for a Letter, never 보내다.
 */
function lineFor(group: NewsGroup): string {
  const [first] = group.items;
  const who = first.personName;
  const count = group.items.length;
  const where =
    group.by === "journey" && group.journeyTitle ? `${group.journeyTitle} · ` : "";

  switch (first.kind) {
    case "letter":
      return `${where}${who}의 편지`;
    case "photo":
      return `${where}사진 ${count}장`;
    case "visit":
      return `${where}${count > 1 ? `${count}곳 방문` : `${first.title ?? "어딘가"} 방문`}`;
    case "place":
      return `${who}가 담아둔 곳`;
    case "event":
      return first.imminent ? `다가오는 일정 · ${first.title ?? ""}` : `${first.title ?? "새 일정"}`;
    case "note":
      return `${where}${who}의 메모`;
    case "journey":
      return `${first.title ?? "새로운 여정"}`;
    default:
      return `${who}의 소식`;
  }
}
