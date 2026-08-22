import {
  READ_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  type PhotoStorage,
  type SignedUrl,
  type StorageKey,
  type UploadTicket,
} from "./storage";

/**
 * An in-memory `PhotoStorage`, for tests.
 *
 * R2 is genuinely external and — unlike RLS, pgroonga and the Entry triggers —
 * its behaviour is not what our tests are about. So it is faked, and the suite
 * runs with no bucket, no credentials and no network.
 *
 * This fake is deliberately **not** generous. It enforces the two properties
 * the real thing enforces and that the app must not be allowed to violate
 * quietly:
 *
 *   1. **A signed URL expires**, so a test that hoards one fails here rather
 *      than in production fifteen minutes later.
 *   2. **An upload must be redeemed with the ticket it was issued for.**
 *      Uploading to a key nobody signed for, or with the wrong content type,
 *      throws — because R2 answers 403 and a permissive fake would let a broken
 *      client pass every test and fail on the phone.
 *
 * What it does not simulate: network failure, partial uploads, and R2's
 * eventual consistency. Those are real and are handled by the queue's retry
 * states, not by pretending here.
 */
export class FakePhotoStorage implements PhotoStorage {
  /** The bucket. */
  private readonly objects = new Map<
    StorageKey,
    { body: Uint8Array; contentType: string }
  >();

  /** Tickets handed out and not yet expired, keyed by their URL. */
  private readonly tickets = new Map<
    string,
    { key: StorageKey; contentType: string; expiresAt: Date }
  >();

  private counter = 0;

  /** Overridable so a test can make a URL expire without waiting. */
  now: () => Date = () => new Date();

  async signedUpload({
    key,
    contentType,
    expiresInSeconds = UPLOAD_URL_TTL_SECONDS,
  }: {
    key: StorageKey;
    contentType: string;
    byteSize?: number;
    expiresInSeconds?: number;
  }): Promise<UploadTicket> {
    const expiresAt = new Date(this.now().getTime() + expiresInSeconds * 1000);
    /* The counter makes two tickets for the same key distinguishable, which is
       what lets a test assert that a retry got a fresh one. */
    const url = `https://fake-r2.test/${encodeURIComponent(key)}?upload=${++this
      .counter}`;

    this.tickets.set(url, { key, contentType, expiresAt });
    return { url, expiresAt, key, headers: { "content-type": contentType } };
  }

  async signedRead({
    key,
    expiresInSeconds = READ_URL_TTL_SECONDS,
  }: {
    key: StorageKey;
    expiresInSeconds?: number;
  }): Promise<SignedUrl> {
    return {
      url: `https://fake-r2.test/${encodeURIComponent(key)}?read=${++this.counter}`,
      expiresAt: new Date(this.now().getTime() + expiresInSeconds * 1000),
    };
  }

  async put({
    key,
    body,
    contentType,
  }: {
    key: StorageKey;
    body: Uint8Array;
    contentType: string;
  }): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async exists(key: StorageKey): Promise<boolean> {
    return this.objects.has(key);
  }

  async remove(key: StorageKey): Promise<void> {
    this.objects.delete(key);
  }

  // -- What the *client* would do, so a test can play the phone ---------------

  /**
   * Redeem an upload ticket, as the phone's PUT would.
   *
   * This is not part of `PhotoStorage` — the server never calls it. It exists
   * so a test can perform the direct-to-R2 upload that, in production, happens
   * on a device we do not control.
   */
  async uploadWithTicket(
    url: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<void> {
    const ticket = this.tickets.get(url);
    if (!ticket) {
      throw new Error("403: no such upload ticket");
    }
    if (ticket.expiresAt.getTime() <= this.now().getTime()) {
      throw new Error("403: this upload ticket has expired");
    }
    if (ticket.contentType !== contentType) {
      /* The content type is signed into the real URL, so a mismatch is a 403
         there too. A fake that shrugged would hide a real client bug. */
      throw new Error("403: content type does not match the signed ticket");
    }

    this.objects.set(ticket.key, { body, contentType });
  }

  // -- Inspection, for assertions --------------------------------------------

  /** What is in the bucket, for a test that wants to say "and nothing else". */
  keys(): StorageKey[] {
    return [...this.objects.keys()].sort();
  }

  read(key: StorageKey): Uint8Array | undefined {
    return this.objects.get(key)?.body;
  }

  contentTypeOf(key: StorageKey): string | undefined {
    return this.objects.get(key)?.contentType;
  }
}
