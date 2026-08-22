import { asPerson } from "./as-person";
import { photoStorage } from "./index";
import { READ_URL_TTL_SECONDS } from "./storage";

/**
 * The GPS review queue: reading it, and answering it.
 *
 * **GPS proposes, never creates.** Everything here exists so that the step
 * between a coordinate and a Place is a person, not a job. The accept and
 * dismiss both go through the database functions in migration 006, because
 * answering a proposal is three writes that must all happen or none.
 */

export interface OpenProposal {
  id: string;
  photoId: string;
  latitude: number;
  longitude: number;
  occurredAt: Date;
  /** A signed, expiring URL, so a person can see what they are naming. */
  thumbnailUrl: string;
}

export interface NearbyPlace {
  id: string;
  name: string;
}

/** Open proposals, in the order the afternoon actually went. */
export async function openProposals(personId: string): Promise<OpenProposal[]> {
  const rows = await asPerson(personId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      photo_id: string;
      latitude: number;
      longitude: number;
      photo_occurred_at: Date;
      storage_key: string;
      thumb_key: string | null;
    }>(
      `SELECT pp.id, pp.photo_id, pp.latitude, pp.longitude, pp.photo_occurred_at,
              p.storage_key,
              (SELECT r.storage_key FROM rendition r
                WHERE r.photo_id = p.id AND r.kind = 'thumb') AS thumb_key
         FROM place_proposal pp
         JOIN photo p ON p.id = pp.photo_id
        WHERE pp.resolved_at IS NULL
          AND p.deleted_at IS NULL
        ORDER BY pp.photo_occurred_at DESC
        LIMIT 50`,
    );
    return rows;
  });

  const storage = photoStorage();

  return Promise.all(
    rows.map(async (row) => {
      const { url } = await storage.signedRead({
        key: row.thumb_key ?? row.storage_key,
        expiresInSeconds: READ_URL_TTL_SECONDS,
      });
      return {
        id: row.id,
        photoId: row.photo_id,
        latitude: row.latitude,
        longitude: row.longitude,
        occurredAt: row.photo_occurred_at,
        thumbnailUrl: url,
      };
    }),
  );
}

/**
 * Places already on the map near a proposal's coordinates.
 *
 * Offered first, because most photos are taken somewhere we have already named
 * — and a queue that only offers "make a new Place" produces three pins called
 * 광화문 within a month.
 *
 * The distance is plain arithmetic on a degree box rather than PostGIS: two
 * people pinning places need "roughly near this", and a geometry type would be
 * a dependency bought for nothing (002 makes the same call).
 */
export async function placesNear(
  personId: string,
  latitude: number,
  longitude: number,
): Promise<NearbyPlace[]> {
  return asPerson(personId, async (client) => {
    /* ~2km at Korean latitudes. Wide enough to catch the same building from
       across the street, narrow enough not to offer the whole neighbourhood. */
    const box = 0.02;
    /* The casts are load-bearing, not decoration. Postgres infers a parameter's
       type from its context, and `$1 - $3` gives it none — both sides are
       unknown, and it fails with "operator is not unique" rather than guessing.
       Saying `double precision` once fixes every use of them below. */
    const { rows } = await client.query<NearbyPlace>(
      `SELECT id, name FROM place
        WHERE latitude BETWEEN $1::double precision - $3::double precision
                           AND $1::double precision + $3::double precision
          AND longitude BETWEEN $2::double precision - $3::double precision
                            AND $2::double precision + $3::double precision
        ORDER BY abs(latitude - $1::double precision)
               + abs(longitude - $2::double precision)
        LIMIT 5`,
      [latitude, longitude, box],
    );
    return rows;
  });
}

/**
 * Answer a proposal: attach the Photo to a Place, naming a new one if asked.
 *
 * Delegates to `accept_place_proposal`, which is where the three writes are
 * made atomic. Nothing here decides anything the database does not.
 */
export async function acceptProposal(
  personId: string,
  proposalId: string,
  answer: { placeId?: string | null; name?: string | null },
): Promise<string> {
  return asPerson(personId, async (client) => {
    const { rows } = await client.query<{ accept_place_proposal: string }>(
      "SELECT accept_place_proposal($1, $2, $3)",
      [proposalId, answer.placeId ?? null, answer.name ?? null],
    );
    return rows[0].accept_place_proposal;
  });
}

/** Close a proposal without making a Place. The Photo keeps its coordinates. */
export async function dismissProposal(
  personId: string,
  proposalId: string,
): Promise<void> {
  await asPerson(personId, async (client) => {
    await client.query("SELECT dismiss_place_proposal($1)", [proposalId]);
  });
}
