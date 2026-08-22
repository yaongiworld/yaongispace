"use server";

import { revalidatePath } from "next/cache";
import { currentPersonId } from "@/lib/auth/current-person";
import { acceptProposal, dismissProposal } from "@/lib/photos/proposals";

/**
 * Answering a proposal, from the page.
 *
 * Server actions rather than API routes: this is a form on one page, submitted
 * by the person looking at it. An endpoint would be a second surface to secure
 * for no gain.
 *
 * Both actions re-check the session themselves. A server action is a POST
 * endpoint like any other — being written next to the component does not
 * authenticate it.
 */

export async function accept(formData: FormData): Promise<void> {
  const personId = await currentPersonId();
  if (!personId) return;

  const proposalId = String(formData.get("proposalId") ?? "");
  const placeId = String(formData.get("placeId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!proposalId) return;
  /* Neither a Place nor a name means there is nothing to accept — the database
     refuses it too, and this is the friendlier half of that refusal: the form
     simply does nothing rather than showing an error for an empty field. */
  if (!placeId && !name) return;

  await acceptProposal(personId, proposalId, {
    placeId: placeId || null,
    name: name || null,
  });

  revalidatePath("/photos/places");
  revalidatePath("/photos");
}

export async function dismiss(formData: FormData): Promise<void> {
  const personId = await currentPersonId();
  if (!personId) return;

  const proposalId = String(formData.get("proposalId") ?? "");
  if (!proposalId) return;

  await dismissProposal(personId, proposalId);

  revalidatePath("/photos/places");
  revalidatePath("/photos");
}
