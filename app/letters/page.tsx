import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionPage } from "../SectionPage";
import { currentPersonId } from "@/lib/auth/current-person";
import { lettersFor, type LetterSummary } from "@/lib/letters";
import { koreanRelative } from "@/lib/korean-date";

/**
 * 편지 — the letterbox.
 *
 * What is here is what this Person may see. A Letter sealed until a date is
 * not in the list, and there is **no countdown, no placeholder and no "1통이
 * 기다리고 있어요"** — the whole point is that its existence does not leak, and
 * a greyed-out row saying "잠긴 편지" would give away the surprise as
 * thoroughly as opening it. It is absent, and the database is what makes it
 * absent (see `lib/letters.ts`).
 *
 * Listing a Letter does not open it. Only the letter page does that, and only
 * for its recipient.
 */

export const metadata = {
  title: "편지 · 야옹이월드",
};

// Letters change when we write them, so this page is never cached.
export const dynamic = "force-dynamic";

export default async function LettersPage() {
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");

  const letters = await lettersFor(personId);

  return (
    <SectionPage title="편지">
      <WriteLink />
      {letters.length === 0 ? (
        <NoLettersYet />
      ) : (
        <ul className="flex flex-col gap-3">
          {letters.map((letter) => (
            <li key={letter.id}>
              <LetterCard letter={letter} me={personId} />
            </li>
          ))}
        </ul>
      )}
    </SectionPage>
  );
}

function WriteLink() {
  return (
    <Link
      href="/letters/write"
      className="flex items-center justify-center gap-2 bg-clay-card px-6 py-4 text-base text-clay-ink transition-transform active:scale-[0.98]"
      style={{
        borderRadius: "var(--radius-clay-pill)",
        boxShadow: "var(--shadow-clay)",
      }}
    >
      새 편지 쓰기
    </Link>
  );
}

/**
 * An empty letterbox.
 *
 * Warm, and not a prompt — the same stance the home page takes on a quiet day.
 * "아직 편지가 없어요" is a state, not a nudge to write one.
 */
function NoLettersYet() {
  return (
    <div
      className="flex flex-col items-center gap-2 px-6 py-12 text-center"
      style={{
        background: "var(--color-clay-card-quiet)",
        borderRadius: "var(--radius-clay-lg)",
        boxShadow: "var(--shadow-clay)",
      }}
    >
      <p className="text-sm text-clay-ink-soft">아직 편지가 없어요</p>
    </div>
  );
}

function LetterCard({ letter, me }: { letter: LetterSummary; me: string }) {
  const mine = letter.authorId === me;
  // Unread is a fact about its recipient. My own letter is never waiting for me.
  const waiting = !mine && letter.readAt === null;

  return (
    <Link
      href={`/letters/${letter.id}`}
      className="flex flex-col gap-2 bg-clay-card px-5 py-4 transition-transform active:scale-[0.99]"
      style={{
        borderRadius: "var(--radius-clay)",
        boxShadow: waiting ? "var(--shadow-clay-lift)" : "var(--shadow-clay)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* 봉한 편지, never 보낸 편지 — the verb is sealing, and it stays the
            verb in the list as well as on the button. */}
        <span className="text-sm text-clay-ink-soft">
          {mine ? "내가 봉한 편지" : `${letter.authorName}가 봉한 편지`}
        </span>
        <span className="shrink-0 text-xs text-clay-ink-soft">
          {koreanRelative(letter.occurredAt)}
        </span>
      </div>

      {letter.title && (
        <h2 className="text-lg text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
          {letter.title}
        </h2>
      )}

      <p className="line-clamp-2 text-sm text-clay-ink-soft">{letter.preview}</p>

      {waiting && (
        <span
          className="self-start px-3 py-1 text-xs text-clay-ink"
          style={{
            background: "var(--color-clay-rose)",
            borderRadius: "var(--radius-clay-pill)",
          }}
        >
          아직 안 읽었어요
        </span>
      )}
    </Link>
  );
}
