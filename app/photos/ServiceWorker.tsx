"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, and nudges the upload queue.
 *
 * Mounted from the Photos section rather than the root layout, deliberately.
 * The worker's only jobs are the share target and the upload queue, both of
 * which are this section's; registering it app-wide would put a background
 * script on the sign-in page for no reason. Once registered it is active for
 * the whole origin anyway, which is what the share target needs.
 *
 * The nudge on every visit is the fallback for browsers without Background
 * Sync — Safari, which is Yangcho's phone. There the queue drains when the app
 * is next opened rather than on its own. The photos are safely queued either
 * way; only the timing differs.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({ type: "yaongi:drain" });
      })
      /* A failed registration must not break the page. Without the worker the
         share target falls back to the route handler and the review grid's own
         file picker, which is a worse flow but a working one. */
      .catch(() => {});
  }, []);

  return null;
}
