import { asPerson } from "./as-person";
import { photoStorage } from "./index";
import { READ_URL_TTL_SECONDS } from "./storage";

/**
 * Browsing the curated library.
 *
 * **Deliberately thin.** A chronological grid and nothing else: no month
 * headers, no infinite scroll, no clustering, no search. The real browse design
 * is blocked on the first Takeout export, because what a library wants at 15k
 * items and what it wants at 60k are different designs — and building the wrong
 * one first means either living with it or throwing it away. A grid is the part
 * that is right at either size.
 *
 * See `.wayfinder/tickets/018-run-first-takeout-export.md`.
 */

export interface BrowsePhoto {
  id: string;
  caption: string | null;
  occurredAt: Date;
  width: number | null;
  height: number | null;
  /** A signed, expiring URL for the thumbnail — or the original, if none exists. */
  thumbnailUrl: string;
}

/** How many a page of the grid holds. */
export const PAGE_SIZE = 60;

/**
 * One page of the library, newest first.
 *
 * Ordered by `occurred_at_effective`, which is the stored correction where
 * there is one — so a photo whose date was fixed moves in the grid, rather than
 * staying put everywhere except its own detail page.
 *
 * Tombstoned photos are excluded here as well as from the Entry index. The row
 * survives (ADR-0013); it simply is not part of the library any more.
 */
export async function browse(
  personId: string,
  { before, limit = PAGE_SIZE }: { before?: Date; limit?: number } = {},
): Promise<BrowsePhoto[]> {
  const rows = await asPerson(personId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      caption: string | null;
      occurred_at_effective: Date;
      width: number | null;
      height: number | null;
      storage_key: string;
      thumb_key: string | null;
    }>(
      `SELECT p.id, p.caption, p.occurred_at_effective, p.width, p.height,
              p.storage_key,
              (SELECT r.storage_key FROM rendition r
                WHERE r.photo_id = p.id AND r.kind = 'thumb') AS thumb_key
         FROM photo p
        WHERE p.deleted_at IS NULL
          AND ($1::timestamptz IS NULL OR p.occurred_at_effective < $1)
        ORDER BY p.occurred_at_effective DESC, p.id DESC
        LIMIT $2`,
      [before ?? null, limit],
    );
    return rows;
  });

  const storage = photoStorage();

  return Promise.all(
    rows.map(async (row) => {
      /* The thumbnail where there is one, the original where there is not — a
         photo whose rendition failed to generate is still a photo we hold, and
         showing nothing would make a recoverable gap look like a lost file. */
      const key = row.thumb_key ?? row.storage_key;
      const { url } = await storage.signedRead({
        key,
        expiresInSeconds: READ_URL_TTL_SECONDS,
      });

      return {
        id: row.id,
        caption: row.caption,
        occurredAt: row.occurred_at_effective,
        width: row.width,
        height: row.height,
        thumbnailUrl: url,
      };
    }),
  );
}

/**
 * How many photos are still on their way in.
 *
 * Read from the database rather than from the service worker, so it is the same
 * number on both phones and survives the app being killed — which is the whole
 * reason `import_upload` exists.
 */
export async function pendingCount(personId: string): Promise<number> {
  return asPerson(personId, async (client) => {
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM import_upload
        WHERE person_id = $1 AND state IN ('queued', 'uploading', 'failed')`,
      [personId],
    );
    return Number(rows[0].n);
  });
}

/**
 * GPS proposals still waiting for a human.
 *
 * Shared between us: often the one who did not take the photo is the one who
 * remembers where it was.
 */
export async function openProposalCount(personId: string): Promise<number> {
  return asPerson(personId, async (client) => {
    const { rows } = await client.query<{ n: string }>(
      "SELECT count(*) AS n FROM place_proposal WHERE resolved_at IS NULL",
    );
    return Number(rows[0].n);
  });
}
