import { SectionPage } from "../../SectionPage";
import { ReviewGrid } from "./ReviewGrid";

/**
 * 고르기 — the review grid a share lands on.
 *
 * Sits outside the six tabs on purpose: it is a step in a flow, not a place you
 * navigate to. You arrive here from the phone's share sheet and leave for the
 * library.
 */
export const metadata = {
  title: "사진 고르기",
};

export default function ReviewPage() {
  return (
    <SectionPage title="사진 고르기">
      <ReviewGrid />
    </SectionPage>
  );
}
