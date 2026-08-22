import { SectionPage } from "../../SectionPage";
import { ProposalQueue } from "./ProposalQueue";
import { currentPersonId } from "@/lib/auth/current-person";
import { openProposals, type OpenProposal } from "@/lib/photos/proposals";

/**
 * 어디였을까 — the GPS review queue.
 *
 * **GPS proposes, never creates.** A photo's coordinates are a measurement; a
 * Place is somewhere we named and chose to put on the map. This page is the
 * gap between the two, and it is the only thing that closes it: without a human
 * here, no Place is ever made from EXIF.
 *
 * The alternative — creating Places automatically — fills the world map with
 * pins named after decimals, and turns it from *our places* into *everywhere
 * the phone has been*. That is a different app, and a worse one.
 */
export const dynamic = "force-dynamic";

export default async function PlacesPage() {
  const personId = await currentPersonId();

  if (!personId) {
    return (
      <SectionPage title="어디였을까">
        <p className="text-sm text-clay-ink-soft">로그인이 필요해요</p>
      </SectionPage>
    );
  }

  let proposals: OpenProposal[] = [];
  try {
    proposals = await openProposals(personId);
  } catch {
    return (
      <SectionPage title="어디였을까">
        <p className="text-sm text-clay-ink-soft">불러오지 못했어요</p>
      </SectionPage>
    );
  }

  return (
    <SectionPage title="어디였을까">
      <ProposalQueue proposals={proposals} />
    </SectionPage>
  );
}
