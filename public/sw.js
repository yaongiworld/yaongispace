/**
 * The service worker: the share target's real handler, and the upload queue.
 *
 * Two jobs, both of which exist because they must survive the app being closed.
 *
 * ## 1. Catching the share
 *
 * A share target POSTs `multipart/form-data` to `/photos/import`. If that POST
 * went to the network it would carry 40 originals to Vercel — the one thing
 * ADR-0012 forbids. So it is intercepted here, on the device: the files come
 * out of the form, go into IndexedDB, and the browser is redirected to the
 * review grid, which reads them locally. **Nothing has left the phone yet.**
 *
 * ## 2. Uploading in the background
 *
 * After the review grid, the keepers are uploaded from here rather than from
 * the page. That is the whole point: the real case is 40 photos on mobile data
 * after a trip, and the app *will* be backgrounded, locked, or killed. A page
 * doing the uploading dies with it; a service worker is restarted by the
 * browser and picks the queue back up.
 *
 * Each photo takes three steps, and each is separately retryable:
 *   ask for a presigned URL → PUT the bytes **straight to R2** → tell the
 *   server it landed.
 * The bytes go phone → R2 and never touch our servers.
 *
 * Plain JS in `public/`, not bundled: a service worker is a separate script the
 * browser fetches by URL, and putting it through the app's build to save a
 * little syntax would buy a scope and versioning problem for nothing.
 */

const DB_NAME = "yaongi-photos";
const DB_VERSION = 1;
/** Files waiting to be reviewed, straight off the share sheet. */
const SHARED_STORE = "shared";
/** Files the review grid kept, waiting to go to R2. */
const QUEUE_STORE = "queue";

/* Take over as soon as installed. Without this, the first share after install
   lands on the network fallback — which works, but makes the person pick their
   photos a second time for no reason. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------
// IndexedDB, hand-rolled and small
// ---------------------------------------------------------------------------

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SHARED_STORE)) {
        db.createObjectStore(SHARED_STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        /* Keyed by the server's `import_upload` id, so the queue in the browser
           and the queue in the database name the same things. */
        db.createObjectStore(QUEUE_STORE, { keyPath: "uploadId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db, store, mode, run) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const result = run(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function putAll(store, records) {
  const db = await openDb();
  return tx(db, store, "readwrite", (objectStore) => {
    for (const record of records) objectStore.put(record);
  });
}

async function getAll(store) {
  const db = await openDb();
  return tx(db, store, "readonly", (objectStore) => objectStore.getAll());
}

async function remove(store, key) {
  const db = await openDb();
  return tx(db, store, "readwrite", (objectStore) => objectStore.delete(key));
}

// ---------------------------------------------------------------------------
// 1. The share target
// ---------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === "POST" && url.pathname === "/photos/import") {
    event.respondWith(handleShare(event.request));
    return;
  }

  /* Everything else goes to the network untouched. There is deliberately no
     offline cache here: this is an import path, not an offline app, and a stale
     cached shell is a worse failure than a clear "no connection". */
});

async function handleShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll("photos").filter((f) => f instanceof File);

    /* Stored as Blobs, which IndexedDB holds natively — no base64, no copy into
       a string, and no size limit beyond the origin's storage quota. */
    await putAll(
      SHARED_STORE,
      files.map((file) => ({
        blob: file,
        filename: file.name,
        contentType: file.type || "image/jpeg",
        byteSize: file.size,
        sharedAt: Date.now(),
      })),
    );

    return Response.redirect("/photos/review?shared=1", 303);
  } catch {
    /* A share that cannot be stashed still has to go somewhere sensible. The
       review page's own file picker is the way back. */
    return Response.redirect("/photos/review?failed=1", 303);
  }
}

// ---------------------------------------------------------------------------
// 2. The upload queue
// ---------------------------------------------------------------------------

/**
 * The page hands the queue over and stops caring. From here on the uploading
 * belongs to the service worker, which outlives the page.
 */
self.addEventListener("message", (event) => {
  if (event.data?.type === "yaongi:enqueue") {
    event.waitUntil(
      putAll(QUEUE_STORE, event.data.items).then(() => drainQueue()),
    );
  }
  if (event.data?.type === "yaongi:drain") {
    event.waitUntil(drainQueue());
  }
});

/* Background Sync, where it exists (Chrome/Android — which is Towee's phone and
   the platform the share target works on anyway). This is what restarts the
   worker after the app is killed: the browser fires it when there is a
   connection again, whether or not anything is open. */
self.addEventListener("sync", (event) => {
  if (event.tag === "yaongi:uploads") {
    event.waitUntil(drainQueue());
  }
});

let draining = false;

/**
 * Work the queue until it is empty or everything left has failed.
 *
 * Serial, not parallel. Forty concurrent uploads on mobile data is how you get
 * forty timeouts; one at a time finishes sooner and lets progress be reported
 * honestly.
 */
async function drainQueue() {
  if (draining) return;
  draining = true;

  try {
    const items = await getAll(QUEUE_STORE);
    for (const item of items) {
      if (item.state === "failed" && item.attempts >= 5) continue;
      try {
        await uploadOne(item);
        await remove(QUEUE_STORE, item.uploadId);
        await tellPages({ type: "yaongi:uploaded", uploadId: item.uploadId });
      } catch (error) {
        /* Kept, not dropped. A failure that vanishes is a photo lost, and the
           review grid already decided this one was worth keeping. */
        await putAll(QUEUE_STORE, [
          {
            ...item,
            state: "failed",
            attempts: (item.attempts ?? 0) + 1,
            error: String(error),
          },
        ]);
        await tellPages({ type: "yaongi:failed", uploadId: item.uploadId });
      }
    }
  } finally {
    draining = false;
  }
}

async function uploadOne(item) {
  /* 1. Ask for somewhere to put it. The server answers `duplicate` when the
        digest is already held — a silent no-op, and the bytes are never spent. */
  const grantResponse = await fetch("/api/photos/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uploadId: item.uploadId, sha256: item.sha256 }),
  });
  if (!grantResponse.ok) throw new Error(`upload-url ${grantResponse.status}`);

  const grant = await grantResponse.json();
  if (grant.outcome === "duplicate") return;

  /* 2. Straight to R2. This request does not go to our origin at all — it is
        the whole reason the URL was presigned. */
  const put = await fetch(grant.ticket.url, {
    method: "PUT",
    body: item.blob,
    headers: grant.ticket.headers,
  });
  if (!put.ok) throw new Error(`R2 ${put.status}`);

  /* 3. Tell the server the bytes landed, and hand over the metadata the phone
        read off the file. Small JSON — no originals. */
  const complete = await fetch("/api/photos/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      uploadId: item.uploadId,
      sha256: item.sha256,
      occurredAt: item.occurredAt ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
      latitude: item.latitude ?? null,
      longitude: item.longitude ?? null,
      exif: item.exif ?? {},
    }),
  });
  if (!complete.ok) throw new Error(`complete ${complete.status}`);
}

async function tellPages(message) {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) client.postMessage(message);
}
