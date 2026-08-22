import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentPersonId } from "@/lib/auth/current-person";
import { letterFor, theOtherPerson } from "@/lib/letters";
import { LetterForm } from "../../LetterForm";
import { revise } from "../../actions";

/**
 * 고쳐 쓰기 — revising a Letter that has not been opened yet.
 *
 * Note this page reads the Letter with `letterFor`, **not** `openLetter`.
 * Editing your own letter must not seal it, and using the opening function
 * here would mean an author locked their own letter by going in to fix a typo.
 * Only the recipient opening it seals it, and this page is for its author.
 */

export const dynamic = "force-dynamic";

export default async function EditLetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");

  const letter = await letterFor(personId, id);
  if (!letter) notFound();

  // Somebody else's letter is not yours to rewrite, and one that has been read
  // is nobody's — the database refuses both, and sending the writer to a form
  // that cannot save would be a worse way to say so.
  if (letter.authorId !== personId || letter.readAt !== null) {
    redirect(`/letters/${id}`);
  }

  const other = await theOtherPerson(personId);
  if (!other) redirect("/letters");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-10 pb-28">
      <Link href={`/letters/${id}`} className="text-sm text-clay-ink-soft">
        ← 편지
      </Link>
      <h1 className="text-3xl text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
        고쳐 쓰기
      </h1>

      <LetterForm
        action={revise}
        recipientName={other.displayName}
        letter={letter}
        submitLabel="다시 봉하기"
      />
    </main>
  );
}
