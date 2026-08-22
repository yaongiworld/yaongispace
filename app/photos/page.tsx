import { SectionPage } from "../SectionPage";

/**
 * 사진 — Photos, the curated library.
 *
 * Empty by design: ticket 08 delivers photo import and the chronological grid.
 * Note that ticket 08 also owns adding the PWA share target to the manifest —
 * see the comment in `app/manifest.ts`.
 */
export default function PhotosPage() {
  return <SectionPage title="사진" />;
}
