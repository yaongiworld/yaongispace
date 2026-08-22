import { R2Storage, r2ConfigFromEnv } from "./r2";
import type { PhotoStorage } from "./storage";

/**
 * The app's one `PhotoStorage`.
 *
 * A single place where the real R2 is constructed, so that the routes depend on
 * the *interface* and only this file knows there is a Cloudflare account behind
 * it. Swapping providers — which `rclone` makes possible at the byte level —
 * would be an edit here and nowhere else.
 *
 * Lazily built and memoised: `r2ConfigFromEnv` throws when the variables are
 * missing, and doing that at module load would take down every route in the app
 * — including sign-in — because R2 was unconfigured. Photos failing is a
 * photos problem.
 */
const globalForStorage = globalThis as unknown as { yaongiStorage?: PhotoStorage };

export function photoStorage(): PhotoStorage {
  globalForStorage.yaongiStorage ??= new R2Storage(r2ConfigFromEnv());
  return globalForStorage.yaongiStorage;
}

export type { PhotoStorage } from "./storage";
