import { accept, dismiss } from "./actions";
import type { OpenProposal } from "@/lib/photos/proposals";

/**
 * The queue of "where was this?".
 *
 * One card per photo, each asking one question. Deliberately not a map: putting
 * an unconfirmed coordinate on the map is most of the way to creating the Place
 * we are refusing to create automatically, and it would make dismissing one
 * feel like deleting something.
 *
 * The coordinates are shown as small grey text rather than as the answer,
 * because they are the evidence and the name is the answer.
 */
export function ProposalQueue({ proposals }: { proposals: OpenProposal[] }) {
  if (proposals.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-2 px-6 py-12 text-center"
        style={{
          background: "var(--color-clay-card-quiet)",
          borderRadius: "var(--radius-clay-lg)",
          boxShadow: "var(--shadow-clay)",
        }}
      >
        <p className="text-sm text-clay-ink-soft">다 확인했어요</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-clay-ink-soft">
        사진이 찍힌 곳에 이름을 붙여주세요. 이름을 붙여야 지도에 올라가요.
      </p>

      {proposals.map((proposal) => (
        <article
          key={proposal.id}
          className="flex flex-col gap-3 p-4"
          style={{
            background: "var(--color-clay-card)",
            borderRadius: "var(--radius-clay)",
            boxShadow: "var(--shadow-clay)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="h-20 w-20 shrink-0 overflow-hidden"
              style={{ borderRadius: "var(--radius-clay-sm)" }}
            >
              {/* Signed URLs expire; next/image would cache them past their
                  lifetime and serve dead links. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proposal.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm text-clay-ink">{koreanDate(proposal.occurredAt)}</p>
              {/* The evidence, not the answer. */}
              <p className="text-xs text-clay-ink-soft">
                {proposal.latitude.toFixed(4)}, {proposal.longitude.toFixed(4)}
              </p>
            </div>
          </div>

          <form action={accept} className="flex gap-2">
            <input type="hidden" name="proposalId" value={proposal.id} />
            <input
              type="text"
              name="name"
              placeholder="여기는 어디예요?"
              required
              maxLength={80}
              className="min-w-0 flex-1 px-4 py-2 text-sm text-clay-ink"
              style={{
                background: "var(--color-clay-card-quiet)",
                borderRadius: "var(--radius-clay-pill)",
              }}
            />
            <button
              type="submit"
              className="shrink-0 px-5 py-2 text-sm text-white"
              style={{
                background: "var(--color-clay-berry)",
                borderRadius: "var(--radius-clay-pill)",
              }}
            >
              저장
            </button>
          </form>

          <form action={dismiss}>
            <input type="hidden" name="proposalId" value={proposal.id} />
            <button
              type="submit"
              className="text-xs text-clay-ink-soft underline underline-offset-4"
            >
              {/* Dismissing keeps the photo and its coordinates. Only the
                  question goes away, which is why the wording is about the pin
                  rather than about the photo. */}
              지도에 올리지 않기
            </button>
          </form>
        </article>
      ))}
    </div>
  );
}

/**
 * "2026년 8월 22일" — Korean convention, `Asia/Seoul`.
 *
 * Fixed to Seoul rather than the viewer's zone: a photo taken at 8am in Seoul
 * should read as the 5th on both of our phones, including when one of us is
 * abroad. The timeline is about when it happened to *us*, and we live here.
 */
function koreanDate(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(date);
}
