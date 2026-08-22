import Link from "next/link";
import { SectionPage } from "../SectionPage";
import { ServiceWorker } from "./ServiceWorker";
import { currentPersonId } from "@/lib/photos/session";
import { browse, openProposalCount, pendingCount, type BrowsePhoto } from "@/lib/photos/browse";

/**
 * 사진 — the curated library.
 *
 * A chronological grid, and **deliberately nothing more**. No month headers, no
 * clustering, no search: the real browse design is blocked on the first Takeout
 * export, since a library of 15k items and one of 60k want different designs.
 * Building the wrong one first means either living with it or throwing it away,
 * and the grid is the part that is right at either size.
 *
 * Never rendered from a cache — the signed URLs it serves expire, and a cached
 * page would hand out dead links.
 */
export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const personId = await currentPersonId();

  if (!personId) {
    return (
      <SectionPage title="사진">
        <Quiet>로그인하면 사진을 볼 수 있어요</Quiet>
      </SectionPage>
    );
  }

  /* R2 being unconfigured must not take the page down — the library is still
     there, we simply cannot sign URLs for it yet. */
  let photos: BrowsePhoto[] = [];
  let waiting = 0;
  let proposals = 0;
  let broken = false;
  try {
    [photos, waiting, proposals] = await Promise.all([
      browse(personId),
      pendingCount(personId),
      openProposalCount(personId),
    ]);
  } catch {
    broken = true;
  }

  return (
    <SectionPage title="사진">
      <ServiceWorker />

      {waiting > 0 ? (
        /* A quiet line, not a progress bar. The upload is happening in the
           background whether or not this page is open, so the honest thing is
           to say so once and let it be. */
        <p className="text-sm text-clay-ink-soft">{waiting}장이 올라가는 중이에요</p>
      ) : null}

      {proposals > 0 ? (
        <Link
          href="/photos/places"
          className="text-sm text-clay-ink underline underline-offset-4"
        >
          어디서 찍었는지 알려줄 사진 {proposals}장
        </Link>
      ) : null}

      {broken ? <Quiet>사진을 불러오지 못했어요</Quiet> : null}

      {!broken && photos.length === 0 ? (
        <Quiet>아직 사진이 없어요</Quiet>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <li key={photo.id}>
              <div
                className="relative aspect-square w-full overflow-hidden"
                style={{ borderRadius: "var(--radius-clay-sm)" }}
              >
                {/* Not next/image: these are signed URLs that expire, and the
                    optimiser would cache them past their lifetime and serve
                    dead links. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbnailUrl}
                  alt={photo.caption ?? ""}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/photos/review"
        className="w-full px-6 py-3 text-center text-sm text-clay-ink"
        style={{
          background: "var(--color-clay-card)",
          borderRadius: "var(--radius-clay-pill)",
          boxShadow: "var(--shadow-clay)",
        }}
      >
        사진 가져오기
      </Link>
    </SectionPage>
  );
}

/** A warm empty state rather than a blank page or a spinner. */
function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col items-center gap-2 px-6 py-12 text-center"
      style={{
        background: "var(--color-clay-card-quiet)",
        borderRadius: "var(--radius-clay-lg)",
        boxShadow: "var(--shadow-clay)",
      }}
    >
      <p className="text-sm text-clay-ink-soft">{children}</p>
    </div>
  );
}
