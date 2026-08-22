import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentPersonId } from "@/lib/auth/current-person";
import { openLetter } from "@/lib/letters";
import { koreanDate } from "@/lib/korean-date";

/**
 * One Letter, open.
 *
 * **This page is the seal.** Opening the letter is what marks it read, and it
 * is the only thing in the app that does — seeing it in the letterbox does
 * not, and seeing it in News (ticket 06) must not either. That is why the
 * marking happens here, in the page that renders the body, and not in the list
 * that links to it.
 *
 * The body is set in Gaegu, the handwriting face. It is the one place in the
 * app where the type is doing something other than being legible chrome.
 */

export const dynamic = "force-dynamic";

export default async function LetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");

  // Opening it is what seals it — but only when it is this Person's to read,
  // only the first time, and only once it has unsealed. `open_letter` decides
  // all three; this page just opens it and renders what comes back.
  const letter = await openLetter(personId, id);

  // Not ours, or sealed until a date that has not come. Both are the same
  // answer from here: there is no such letter. Never "이 편지는 아직 열 수
  // 없어요", which would confirm that there is one.
  if (!letter) notFound();

  const mine = letter.authorId === personId;
  const editable = mine && letter.readAt === null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-10 pb-28">
      <Link href="/letters" className="text-sm text-clay-ink-soft">
        ← 편지함
      </Link>

      <article
        className="flex flex-col gap-4 bg-clay-card px-6 py-7"
        style={{
          borderRadius: "var(--radius-clay-lg)",
          boxShadow: "var(--shadow-clay)",
        }}
      >
        <header className="flex flex-col gap-1">
          {letter.title && (
            <h1
              className="text-2xl text-clay-ink"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {letter.title}
            </h1>
          )}
          <p className="text-sm text-clay-ink-soft">
            {mine ? "내가 봉한 편지" : `${letter.authorName}가 봉한 편지`}
            {" · "}
            {koreanDate(letter.occurredAt)}
          </p>
        </header>

        {/* The hand. Gaegu, with Pretendard behind it for the syllables it
            does not carry — see app/fonts.ts. */}
        <div
          className="whitespace-pre-wrap text-lg leading-loose text-clay-ink"
          style={{ fontFamily: "var(--font-letter)" }}
        >
          {letter.body}
        </div>
      </article>

      {editable && (
        <Link
          href={`/letters/${letter.id}/edit`}
          className="flex items-center justify-center gap-2 bg-clay-card px-6 py-4 text-base text-clay-ink transition-transform active:scale-[0.98]"
          style={{
            borderRadius: "var(--radius-clay-pill)",
            boxShadow: "var(--shadow-clay)",
          }}
        >
          고쳐 쓰기
        </Link>
      )}

      {mine && letter.readAt !== null && (
        // Its writer may no longer change it, and should be told why rather
        // than finding the button missing.
        <p className="px-2 text-center text-sm text-clay-ink-soft">
          {koreanDate(letter.readAt)}에 읽었어요. 이제 고칠 수 없어요.
        </p>
      )}

      {mine && letter.unsealAt !== null && letter.readAt === null && (
        <p className="px-2 text-center text-sm text-clay-ink-soft">
          {koreanDate(letter.unsealAt)}에 열 수 있어요.
        </p>
      )}
    </main>
  );
}
