import { SectionPage } from "../SectionPage";

/**
 * 편지 — Letters.
 *
 * Empty by design: ticket 04 delivers navigation, ticket 05 delivers Letters.
 * Replace the placeholder by passing children to `SectionPage`, or drop
 * `SectionPage` entirely if the section needs a different frame — it is a
 * convenience, not a contract.
 */
export default function LettersPage() {
  return <SectionPage title="편지" />;
}
