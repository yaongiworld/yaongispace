import { createHash, createHmac } from "node:crypto";
import {
  READ_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  type PhotoStorage,
  type SignedUrl,
  type StorageKey,
  type UploadTicket,
} from "./storage";

/**
 * The real Cloudflare R2 implementation of `PhotoStorage`.
 *
 * ## Why this signs URLs by hand
 *
 * R2 speaks S3, and the obvious move is `@aws-sdk/client-s3` plus
 * `@aws-sdk/s3-request-presigner`. That is several megabytes of dependency, a
 * vendor's release cadence, and a surface far wider than the five things this
 * app does — for an archive meant to outlive several rewrites of that SDK.
 *
 * SigV4 query-string presigning is a documented, stable algorithm: canonical
 * request, string to sign, four HMACs, done. It is written out below with the
 * steps named, so a future reader can check it against Amazon's reference
 * rather than trusting it. Everything else here is `fetch`.
 *
 * The trade is real and worth stating: hand-rolled signing is code we own and
 * must debug ourselves if R2 ever changes. It has not in the S3 API's lifetime,
 * and `rclone` remains the escape hatch that does not depend on this file at all.
 *
 * ## Untested against a real bucket
 *
 * There is no R2 bucket and no credentials in this environment, so nothing in
 * this file has run against Cloudflare. Its signing is unit-tested against the
 * algorithm's own invariants (`tests/photo-storage.test.ts`), which catches a
 * malformed URL but cannot catch a wrong assumption about what R2 accepts.
 * **First contact with a real bucket is still ahead.**
 */

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /**
   * Optional custom domain the bytes are served from. Without it, URLs point at
   * the account's `r2.cloudflarestorage.com` endpoint, which works and is ugly.
   */
  publicHost?: string;
}

/**
 * R2's region is always `auto`. It has no regions; the string is present only
 * because SigV4's scope requires one, and it must match exactly.
 */
const REGION = "auto";
const SERVICE = "s3";

/**
 * Read the configuration from the environment, or explain what is missing.
 *
 * Throws rather than returning a partial config: a storage layer that silently
 * came up half-configured would fail at the first upload, in the background, on
 * somebody's phone, after a trip.
 */
export function r2ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): R2Config {
  const required = {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => `R2_${name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);

  if (missing.length > 0) {
    throw new Error(
      `Cloudflare R2 is not configured: missing ${missing.join(", ")}. See .env.example.`,
    );
  }

  return {
    accountId: required.accountId!,
    accessKeyId: required.accessKeyId!,
    secretAccessKey: required.secretAccessKey!,
    bucket: required.bucket!,
    publicHost: env.R2_PUBLIC_HOST,
  };
}

export class R2Storage implements PhotoStorage {
  constructor(private readonly config: R2Config) {}

  async signedUpload({
    key,
    contentType,
    byteSize,
    expiresInSeconds = UPLOAD_URL_TTL_SECONDS,
  }: {
    key: StorageKey;
    contentType: string;
    byteSize?: number;
    expiresInSeconds?: number;
  }): Promise<UploadTicket> {
    /* `content-type` is signed, so the client must send exactly this back. If
       it sends something else the signature will not match and R2 answers 403
       — which is the right outcome: it stops a ticket issued for a JPEG being
       used to upload something else entirely. */
    const headers: Record<string, string> = { "content-type": contentType };
    if (byteSize !== undefined) headers["content-length"] = String(byteSize);

    const { url, expiresAt } = this.presign("PUT", key, expiresInSeconds, headers);
    return { url, expiresAt, key, headers };
  }

  async signedRead({
    key,
    expiresInSeconds = READ_URL_TTL_SECONDS,
  }: {
    key: StorageKey;
    expiresInSeconds?: number;
  }): Promise<SignedUrl> {
    return this.presign("GET", key, expiresInSeconds, {});
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
    /* Renditions only. They are made on the server by sharp and are small; an
       original arriving here would mean bytes travelled through Vercel. */
    const { url, headers } = await this.signedUpload({
      key,
      contentType,
      byteSize: body.byteLength,
    });

    const response = await fetch(url, { method: "PUT", body, headers });
    if (!response.ok) {
      throw new Error(`R2 rejected a write to ${key}: ${response.status}`);
    }
  }

  async exists(key: StorageKey): Promise<boolean> {
    const { url } = this.presign("HEAD", key, 60, {});
    const response = await fetch(url, { method: "HEAD" });
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new Error(`R2 could not be asked about ${key}: ${response.status}`);
    }
    return true;
  }

  async remove(key: StorageKey): Promise<void> {
    const { url } = this.presign("DELETE", key, 60, {});
    const response = await fetch(url, { method: "DELETE" });
    /* 404 is success: the object is not there, which is what was wanted. */
    if (!response.ok && response.status !== 404) {
      throw new Error(`R2 refused to remove ${key}: ${response.status}`);
    }
  }

  /** The endpoint bytes actually go to. A custom domain only changes the host. */
  private host(): string {
    return (
      this.config.publicHost ?? `${this.config.accountId}.r2.cloudflarestorage.com`
    );
  }

  /**
   * SigV4 query-string presigning.
   *
   * The five steps, in Amazon's own order, each labelled below. Nothing here is
   * clever; it is clarity so it can be checked against the spec.
   */
  private presign(
    method: string,
    key: StorageKey,
    expiresInSeconds: number,
    signedHeaders: Record<string, string>,
  ): SignedUrl {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const host = this.host();

    /* The path. Each segment is encoded separately: `/` between segments is
       structure and must survive, everything inside one is data. */
    const canonicalUri =
      "/" +
      [this.config.bucket, ...key.split("/")]
        .map((segment) => encodeRfc3986(segment))
        .join("/");

    /* `host` is always signed. Anything else the caller named is signed too,
       sorted, because SigV4 requires the list in lexical order. */
    const headers: Record<string, string> = { host, ...lowerKeys(signedHeaders) };
    const headerNames = Object.keys(headers).sort();
    const signedHeaderList = headerNames.join(";");

    const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

    /* Query parameters, sorted by key. `X-Amz-Signature` is not among them —
       it is what all of this produces. */
    const query: Record<string, string> = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.config.accessKeyId}/${credentialScope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresInSeconds),
      "X-Amz-SignedHeaders": signedHeaderList,
    };
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(query[k])}`)
      .join("&");

    /* 1. The canonical request. `UNSIGNED-PAYLOAD` because a presigned URL is
          handed to a client whose bytes we have not seen and cannot hash. */
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      headerNames.map((n) => `${n}:${headers[n].trim()}`).join("\n") + "\n",
      signedHeaderList,
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    /* 2. The string to sign. */
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    /* 3. The signing key: four chained HMACs, each keyed by the last. This is
          what makes a leaked signature useless outside its day, region and
          service. Written out rather than folded, because the order is the
          whole algorithm and a reduce hides it. */
    const dateKey = hmac(`AWS4${this.config.secretAccessKey}`, dateStamp);
    const regionKey = hmac(dateKey, REGION);
    const serviceKey = hmac(regionKey, SERVICE);
    const signingKey = hmac(serviceKey, "aws4_request");

    /* 4. The signature. */
    const signature = hmac(signingKey, stringToSign).toString("hex");

    /* 5. The URL. */
    return {
      url: `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
    };
  }
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function lowerKeys(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k.toLowerCase(), v]),
  );
}

/**
 * RFC 3986 percent-encoding, which is *not* what `encodeURIComponent` does.
 *
 * `encodeURIComponent` leaves `!'()*` alone; SigV4 requires them encoded, and a
 * key containing any of them would produce a signature mismatch that looks like
 * a credentials problem. Photo keys are digests today and contain none of these
 * — this is here so that stays true when it stops being true.
 */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
