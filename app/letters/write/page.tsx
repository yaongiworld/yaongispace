import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPersonId } from "@/lib/auth/current-person";
import { theOtherPerson } from "@/lib/letters";
import { LetterForm } from "../LetterForm";
import { seal } from "../actions";

/**
 * 새 편지 — writing one.
 *
 * There is no recipient picker. There are two of us, so a Letter is addressed
 * to the other one by definition — a dropdown with one option in it would be
 * furniture pretending to be a choice.
 */

export const metadata = {
  title: "새 편지 · 야옹이월드",
};

export const dynamic = "force-dynamic";

export default async function WriteLetterPage() {
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");

  const other = await theOtherPerson(personId);
  if (!other) redirect("/letters");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-10 pb-28">
      <Link href="/letters" className="text-sm text-clay-ink-soft">
        ← 편지함
      </Link>
      <h1 className="text-3xl text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
        새 편지
      </h1>

      {/* 봉하기, never 보내기. Sealing is the ceremony. */}
      <LetterForm action={seal} recipientName={other.displayName} submitLabel="봉하기" />
    </main>
  );
}
