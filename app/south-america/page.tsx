import { redirect } from "next/navigation";
import { currentPersonId } from "@/lib/auth/current-person";
import { getSnapshot } from "@/lib/south-america/server/store";
import { SouthAmericaApp } from "./SouthAmericaApp";

/**
 * PROJECT SOUTH AMERICA — the two of us planning the evening and training.
 *
 * Signed-out visitors go to the front door like everywhere else. Someone who
 * is signed in but is not one of the planner's two members sees a short
 * explanation rather than an empty app: `sa_member` is a deliberate binding,
 * not something the page creates on first visit.
 */

export const metadata = {
  title: "PROJECT SOUTH AMERICA",
};

// A live reading of the shared day; never cached.
export const dynamic = "force-dynamic";

export default async function SouthAmericaPage() {
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");

  const snapshot = await getSnapshot(personId);
  if (!snapshot) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-5 text-clay-ink">
        <h1 className="text-2xl" style={{ fontFamily: "var(--font-display)" }}>
          아직 이 공간에 연결되지 않았어요
        </h1>
        <p className="text-clay-ink-soft">
          이 계정은 PROJECT SOUTH AMERICA의 멤버로 등록되어 있지 않아요. 양초와 타위 계정만 들어올 수 있어요.
        </p>
      </main>
    );
  }

  return <SouthAmericaApp initial={snapshot} />;
}
