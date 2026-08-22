import { describe, expect, test } from "vitest";
import { FakePhotoStorage } from "../lib/photos/fake";
import { R2Storage, r2ConfigFromEnv } from "../lib/photos/r2";
import {
  originalKey,
  READ_URL_TTL_SECONDS,
  renditionKey,
  UPLOAD_URL_TTL_SECONDS,
} from "../lib/photos/storage";

/**
 * The storage seam (ticket 08).
 *
 * R2 is genuinely external and its behaviour is not what these tests are about,
 * so the fake is what the import tests run against. What *is* worth asserting
 * here is the part we wrote: the key scheme, and that the presigned URLs come
 * out shaped the way SigV4 requires.
 *
 * **What this cannot assert:** that Cloudflare accepts them. There is no bucket
 * and no credentials in this environment, so `R2Storage` has never spoken to
 * R2. These tests catch a malformed URL, not a wrong assumption about what R2
 * wants. Say so plainly rather than letting green ticks imply otherwise.
 */

const SHA = "a".repeat(64);

describe("where bytes go", () => {
  test("an original's key is its digest, so the same bytes never store twice", () => {
    // This is what lets the upload queue retry without coordinating: a repeated
    // upload overwrites itself with an identical file.
    expect(originalKey(SHA, "image/jpeg")).toBe(originalKey(SHA, "image/jpeg"));
    expect(originalKey(SHA, "image/jpeg")).toContain(SHA);
  });

  test("originals and renditions never collide", () => {
    // A rendition overwriting an original would be exactly the in-place edit
    // ADR-0013 exists to make impossible.
    expect(originalKey(SHA, "image/jpeg")).not.toBe(
      renditionKey(SHA, "thumb", "image/webp"),
    );
    expect(originalKey(SHA, "image/jpeg").startsWith("originals/")).toBe(true);
    expect(renditionKey(SHA, "thumb", "image/webp").startsWith("renditions/")).toBe(
      true,
    );
  });

  test("each rendition kind gets its own key", () => {
    expect(renditionKey(SHA, "thumb", "image/webp")).not.toBe(
      renditionKey(SHA, "display", "image/webp"),
    );
  });

  test("keys are sharded, so no prefix holds the whole library", () => {
    // Cosmetic for R2, but it matters the day we `rclone` the archive out.
    expect(originalKey(SHA, "image/jpeg")).toBe(
      `originals/aa/${SHA}.jpg`,
    );
  });
});

describe("the R2 presigner", () => {
  const storage = new R2Storage({
    accountId: "acct",
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "s3cret-example-key",
    bucket: "yaongi-photos",
  });

  test("an upload URL carries every parameter SigV4 requires", async () => {
    const ticket = await storage.signedUpload({
      key: originalKey(SHA, "image/jpeg"),
      contentType: "image/jpeg",
      byteSize: 3_145_728,
    });

    const url = new URL(ticket.url);
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("AKIAEXAMPLE");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/aws4_request");
    expect(url.searchParams.get("X-Amz-Date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(url.searchParams.get("X-Amz-Expires")).toBe(String(UPLOAD_URL_TTL_SECONDS));
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the bucket is in the path and the account is the host", async () => {
    const ticket = await storage.signedUpload({
      key: "originals/aa/x.jpg",
      contentType: "image/jpeg",
    });
    const url = new URL(ticket.url);
    expect(url.host).toBe("acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/yaongi-photos/originals/aa/x.jpg");
  });

  test("content-type is signed, so a ticket for a JPEG cannot upload something else", async () => {
    const ticket = await storage.signedUpload({
      key: "originals/aa/x.jpg",
      contentType: "image/jpeg",
    });
    expect(
      new URL(ticket.url).searchParams.get("X-Amz-SignedHeaders"),
    ).toContain("content-type");
    // And the client is told exactly what to send back, rather than guessing.
    expect(ticket.headers["content-type"]).toBe("image/jpeg");
  });

  test("changing anything changes the signature", async () => {
    // The cheapest possible check that the signature actually covers the
    // request rather than being decoration.
    const a = await storage.signedUpload({ key: "originals/aa/a.jpg", contentType: "image/jpeg" });
    const b = await storage.signedUpload({ key: "originals/aa/b.jpg", contentType: "image/jpeg" });
    const sig = (u: string) => new URL(u).searchParams.get("X-Amz-Signature");
    expect(sig(a.url)).not.toBe(sig(b.url));
  });

  test("a read URL expires, and sooner than an upload", async () => {
    // Long enough to scroll a grid; short enough that one caught in a
    // screenshot is worthless by the time anybody finds it.
    const read = await storage.signedRead({ key: "originals/aa/x.jpg" });
    expect(read.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(READ_URL_TTL_SECONDS).toBeLessThan(UPLOAD_URL_TTL_SECONDS);
    expect(new URL(read.url).searchParams.get("X-Amz-Expires")).toBe(
      String(READ_URL_TTL_SECONDS),
    );
  });

  test("a custom domain only changes the host", async () => {
    const custom = new R2Storage({
      accountId: "acct",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "s3cret-example-key",
      bucket: "yaongi-photos",
      publicHost: "photos.yaongi.world",
    });
    const { url } = await custom.signedRead({ key: "originals/aa/x.jpg" });
    expect(new URL(url).host).toBe("photos.yaongi.world");
  });
});

describe("R2 configuration", () => {
  test("names every variable that is missing, rather than failing at first upload", () => {
    expect(() => r2ConfigFromEnv({} as NodeJS.ProcessEnv)).toThrow(
      /R2_ACCOUNT_ID.*R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY.*R2_BUCKET/,
    );
  });

  test("reads a complete configuration", () => {
    const config = r2ConfigFromEnv({
      R2_ACCOUNT_ID: "acct",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "bucket",
    } as NodeJS.ProcessEnv);
    expect(config.bucket).toBe("bucket");
    expect(config.publicHost).toBeUndefined();
  });
});

describe("the fake", () => {
  test("an upload ticket must be redeemed for the key it was issued for", async () => {
    const storage = new FakePhotoStorage();
    const ticket = await storage.signedUpload({
      key: "originals/aa/x.jpg",
      contentType: "image/jpeg",
    });

    await storage.uploadWithTicket(ticket.url, new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(await storage.exists("originals/aa/x.jpg")).toBe(true);

    // A URL nobody signed is a 403 on R2, and must be here too — a permissive
    // fake would let a broken client pass every test and fail on the phone.
    await expect(
      storage.uploadWithTicket(
        "https://fake-r2.test/whatever?upload=999",
        new Uint8Array([1]),
        "image/jpeg",
      ),
    ).rejects.toThrow(/403/);
  });

  test("a ticket redeemed with the wrong content type is refused", async () => {
    const storage = new FakePhotoStorage();
    const ticket = await storage.signedUpload({
      key: "originals/aa/x.jpg",
      contentType: "image/jpeg",
    });
    await expect(
      storage.uploadWithTicket(ticket.url, new Uint8Array([1]), "image/png"),
    ).rejects.toThrow(/403/);
  });

  test("a ticket expires", async () => {
    const storage = new FakePhotoStorage();
    const ticket = await storage.signedUpload({
      key: "originals/aa/x.jpg",
      contentType: "image/jpeg",
      expiresInSeconds: 60,
    });

    storage.now = () => new Date(Date.now() + 61_000);
    await expect(
      storage.uploadWithTicket(ticket.url, new Uint8Array([1]), "image/jpeg"),
    ).rejects.toThrow(/expired/);
  });
});
