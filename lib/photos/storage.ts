/**
 * Where photo bytes live: one narrow interface over Cloudflare R2.
 *
 * R2 rather than Supabase Storage because Supabase bills one egress quota
 * across database, auth and storage — meaning the photo library would be able
 * to break login — and because hosted Supabase cannot point at our own bucket,
 * so "adopt it now, swap later" is not an exit that exists (ADR-0012).
 *
 * ## The shape, and why it is this shape
 *
 * **Bytes must never transit Vercel.** Not as an optimisation: a route handler
 * that receives a 12MB original and forwards it is paying Vercel's function
 * duration and bandwidth for something the phone could send directly, and it
 * caps every upload at the platform's request body limit — which a burst of 40
 * photos after a trip walks straight into.
 *
 * So this interface deals only in **URLs and metadata**. There is no `putBytes`
 * that takes a Buffer and no route that accepts a file:
 *
 *   - `signedUpload()` hands the client a URL it PUTs the original to itself.
 *   - `signedRead()` hands the client a URL it GETs from directly.
 *   - `put()` exists for bytes the *server* legitimately made — renditions,
 *     which are generated at import with sharp and are small.
 *
 * That asymmetry is the design. Originals go phone → R2 and are never seen by
 * our servers; renditions are derived server-side and are written from there.
 *
 * ## Why an interface at all
 *
 * R2 is genuinely external and, unlike RLS, its behaviour is not what our tests
 * are about. Faking it costs one small class and buys a suite that runs with no
 * bucket, no credentials and no network. See `fake.ts`.
 *
 * Deliberately not a general object-storage abstraction. Five methods, all of
 * them things the import path actually does. A wrapper that mirrored the whole
 * S3 API would be a second SDK to maintain for two people.
 */

/** A key in the bucket. Write-once for originals (ADR-0013). */
export type StorageKey = string;

/** A URL the client may use directly, and the moment it stops working. */
export interface SignedUrl {
  url: string;
  /** Absolute, not a duration — a caller comparing to `now` cannot get it wrong. */
  expiresAt: Date;
}

export interface UploadTicket extends SignedUrl {
  /** Where the bytes will land. Recorded on the queue row before the PUT. */
  key: StorageKey;
  /**
   * Headers the client must send with its PUT, or the signature will not match.
   * Returned rather than assumed, because which headers are signed is R2's
   * business and getting it wrong fails at upload time with an opaque 403.
   */
  headers: Record<string, string>;
}

export interface PhotoStorage {
  /**
   * A URL the client PUTs an original to, directly. The bytes never come near
   * our servers.
   */
  signedUpload(input: {
    key: StorageKey;
    contentType: string;
    /**
     * Signed into the URL so a ticket for a 3MB photo cannot be used to upload
     * 3GB. Without it a leaked URL is an open bucket for its lifetime.
     */
    byteSize?: number;
    expiresInSeconds?: number;
  }): Promise<UploadTicket>;

  /**
   * A URL the client GETs from, directly and briefly.
   *
   * Expiring rather than public, because a public bucket URL is permanent and
   * unguessable-but-shareable — someone who ever saw one keeps it forever. An
   * expiry means access is a decision the app makes each time, and revoking it
   * is a matter of not signing another.
   */
  signedRead(input: {
    key: StorageKey;
    expiresInSeconds?: number;
  }): Promise<SignedUrl>;

  /**
   * Write bytes from the server. **Renditions only** — an original arriving
   * here means it travelled through Vercel and the design has been subverted.
   */
  put(input: {
    key: StorageKey;
    body: Uint8Array;
    contentType: string;
  }): Promise<void>;

  /** Whether an object is there. How a completing upload confirms its bytes landed. */
  exists(key: StorageKey): Promise<boolean>;

  /**
   * Remove an object.
   *
   * **Renditions only, and the type cannot enforce that** — so it is said here
   * instead: deleting a Photo tombstones the row and leaves the original where
   * it is (ADR-0013). This exists because a rendition is rebuildable and
   * throwing a bad one away costs nothing. Nothing in the app calls it on an
   * original, and nothing should.
   */
  remove(key: StorageKey): Promise<void>;
}

/**
 * Where an original's bytes go.
 *
 * Keyed by digest, which makes the key a function of the content: the same
 * bytes always name the same object, so a retry that already succeeded
 * overwrites itself with an identical file rather than making a second copy.
 * That is what lets the upload queue retry safely without a coordination
 * protocol.
 *
 * The two-character shard keeps any one prefix from holding the whole library —
 * R2 does not need it for performance, but `rclone` listing a flat prefix of
 * 15k objects when we exercise the exit is unpleasant, and this costs nothing.
 */
export function originalKey(sha256: string, contentType: string): StorageKey {
  return `originals/${sha256.slice(0, 2)}/${sha256}${extensionFor(contentType)}`;
}

/**
 * Where a Rendition's bytes go.
 *
 * Beside the original, never in place of it. Keyed by the photo's digest and
 * the rendition kind so regenerating one lands on the same key — a rebuilt
 * thumbnail replaces its predecessor, which is fine, because a rendition is
 * derived and losing one costs nothing.
 */
export function renditionKey(
  sha256: string,
  kind: string,
  contentType: string,
): StorageKey {
  return `renditions/${sha256.slice(0, 2)}/${sha256}-${kind}${extensionFor(contentType)}`;
}

/**
 * A file extension for a content type.
 *
 * Cosmetic — the key is the digest and nothing parses this back. It exists so
 * that a human running `rclone ls` during a migration sees files they recognise
 * rather than 15,000 extensionless blobs. Unknown types simply get none.
 */
function extensionFor(contentType: string): string {
  const known: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/avif": ".avif",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
  };
  return known[contentType.toLowerCase()] ?? "";
}

/** How long an upload ticket lives. Long enough for a big file on bad mobile data. */
export const UPLOAD_URL_TTL_SECONDS = 60 * 60;

/**
 * How long a read URL lives.
 *
 * Fifteen minutes: long enough to scroll a grid and open something, short
 * enough that a URL which escapes in a screenshot or a log is worthless by the
 * time anybody finds it.
 */
export const READ_URL_TTL_SECONDS = 15 * 60;
