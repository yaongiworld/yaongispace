"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readClientMetadata } from "@/lib/photos/exif-client";

/**
 * The review grid — the first thing a share sees.
 *
 * **Everything is kept by default and deselected before anything is stored.**
 * That is the curated premise made mechanical: an import path that keeps
 * everything unless you intervene produces a complete library, and a complete
 * library is what Google Photos already is. The subset worth looking at is the
 * thing this app holds, so choosing is the import step, not a later tidy-up.
 *
 * Nothing has left the phone when this renders. The files come from IndexedDB,
 * where the service worker put them; the thumbnails are local object URLs. Only
 * on 저장 does anything go anywhere, and even then it is metadata first and then
 * bytes straight to R2.
 */

type SharedFile = {
  id: number;
  blob: Blob;
  filename: string;
  contentType: string;
  byteSize: number;
};

type Reviewable = SharedFile & {
  keep: boolean;
  previewUrl: string;
};

const DB_NAME = "yaongi-photos";
const SHARED_STORE = "shared";
const QUEUE_STORE = "queue";

export function ReviewGrid() {
  const router = useRouter();
  const [items, setItems] = useState<Reviewable[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /* Revoking object URLs on unmount. Forty full-size photos held as blob URLs
     is real memory on a phone, and a leak here is a tab the browser kills. */
  useEffect(() => {
    return () => {
      for (const item of items) URL.revokeObjectURL(item.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const shared = await readShared();
        if (cancelled) return;
        setItems(
          shared.map((file) => ({
            ...file,
            keep: true,
            previewUrl: URL.createObjectURL(file.blob),
          })),
        );
      } catch {
        if (!cancelled) setError("사진을 불러오지 못했어요");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const added = Array.from(files).map((file, index) => ({
      id: Date.now() + index,
      blob: file,
      filename: file.name,
      contentType: file.type || "image/jpeg",
      byteSize: file.size,
      keep: true,
      previewUrl: URL.createObjectURL(file),
    }));
    setItems((current) => [...current, ...added]);
  }, []);

  const toggle = useCallback((id: number) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, keep: !item.keep } : item)),
    );
  }, []);

  const keepers = items.filter((item) => item.keep);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      /* Hashed here, on the phone, before any bytes are spent — which is what
         lets a photo we already hold be dropped without uploading it. The EXIF
         is read here for the same reason: the file is open on this device, and
         shipping it to a server that must not receive it merely to read a date
         off it would defeat the whole upload design. */
      const withDigests = await Promise.all(
        keepers.map(async (item) => ({
          item,
          sha256: await sha256Of(item.blob),
          metadata: await readClientMetadata(item.blob),
        })),
      );

      const response = await fetch("/api/photos/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: withDigests.map(({ item, sha256 }) => ({
            filename: item.filename,
            contentType: item.contentType,
            byteSize: item.byteSize,
            sha256,
          })),
        }),
      });
      if (!response.ok) throw new Error(String(response.status));

      const { queued } = (await response.json()) as { queued: { id: string }[] };

      /* Hand the bytes to the service worker and stop caring. From here the
         uploading outlives this page — which is the point, because the page
         will not survive a locked phone on the train home. */
      await handOverToServiceWorker(
        queued.map((row, index) => ({
          uploadId: row.id,
          blob: withDigests[index].item.blob,
          sha256: withDigests[index].sha256,
          contentType: withDigests[index].item.contentType,
          attempts: 0,
          ...withDigests[index].metadata,
        })),
      );

      await clearShared();
      router.push("/photos");
    } catch {
      setError("저장하지 못했어요. 다시 시도해 주세요");
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-clay-ink-soft">불러오는 중이에요…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div
          className="flex w-full flex-col items-center gap-2 px-6 py-12 text-center"
          style={{
            background: "var(--color-clay-card-quiet)",
            borderRadius: "var(--radius-clay-lg)",
            boxShadow: "var(--shadow-clay)",
          }}
        >
          <p className="text-sm text-clay-ink-soft">가져올 사진이 없어요</p>
        </div>
        <PickButton inputRef={fileInput} onFiles={addFiles} label="사진 고르기" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-clay-ink-soft">
        {/* The instruction is the whole interaction, so it is stated plainly
            rather than left to be discovered by tapping. */}
        간직할 사진만 남겨주세요. 탭하면 빼요.
      </p>

      <ul className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => toggle(item.id)}
              aria-pressed={item.keep}
              aria-label={item.keep ? `${item.filename} 빼기` : `${item.filename} 넣기`}
              className="relative block aspect-square w-full overflow-hidden"
              style={{
                borderRadius: "var(--radius-clay-sm)",
                boxShadow: item.keep ? "var(--shadow-clay-lift)" : "none",
              }}
            >
              {/* Not next/image: these are local object URLs of files that have
                  never been uploaded, so there is nothing for the optimiser to
                  fetch or cache. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt=""
                className="h-full w-full object-cover transition-opacity"
                style={{ opacity: item.keep ? 1 : 0.35 }}
              />
              {item.keep ? (
                <span
                  aria-hidden
                  className="absolute right-1.5 bottom-1.5 flex h-6 w-6 items-center justify-center text-xs text-white"
                  style={{
                    background: "var(--color-clay-berry)",
                    borderRadius: "var(--radius-clay-pill)",
                  }}
                >
                  ✓
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <PickButton inputRef={fileInput} onFiles={addFiles} label="더 고르기" />

      {error ? <p className="text-sm text-clay-berry">{error}</p> : null}

      <button
        type="button"
        onClick={save}
        disabled={saving || keepers.length === 0}
        className="w-full px-6 py-4 text-base text-white disabled:opacity-40"
        style={{
          background: "var(--color-clay-berry)",
          borderRadius: "var(--radius-clay-pill)",
          boxShadow: "var(--shadow-clay)",
        }}
      >
        {saving
          ? "저장하는 중이에요…"
          : keepers.length === 0
            ? "고른 사진이 없어요"
            : `${keepers.length}장 저장하기`}
      </button>

      <p className="text-center text-xs text-clay-ink-soft">
        {/* Said out loud because it is the reassurance that lets somebody lock
            their phone and walk away, which is exactly what we want them to do. */}
        저장을 누르면 배경에서 천천히 올라가요. 앱을 닫아도 괜찮아요.
      </p>
    </div>
  );
}

function PickButton({
  inputRef,
  onFiles,
  label,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList | null) => void;
  label: string;
}) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => onFiles(event.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full px-6 py-3 text-sm text-clay-ink"
        style={{
          background: "var(--color-clay-card)",
          borderRadius: "var(--radius-clay-pill)",
          boxShadow: "var(--shadow-clay)",
        }}
      >
        {label}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// The device's own storage
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SHARED_STORE)) {
        db.createObjectStore(SHARED_STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "uploadId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readShared(): Promise<SharedFile[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(SHARED_STORE, "readonly")
      .objectStore(SHARED_STORE)
      .getAll();
    request.onsuccess = () => resolve(request.result as SharedFile[]);
    request.onerror = () => reject(request.error);
  });
}

async function clearShared(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHARED_STORE, "readwrite");
    transaction.objectStore(SHARED_STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function handOverToServiceWorker(
  items: {
    uploadId: string;
    blob: Blob;
    sha256: string;
    contentType: string;
    attempts: number;
    /* Read off the file on this device. Travels as a few hundred bytes of JSON
       while the original goes straight to R2. */
    occurredAt: string | null;
    width: number | null;
    height: number | null;
    latitude: number | null;
    longitude: number | null;
    exif: Record<string, unknown>;
  }[],
): Promise<void> {
  const registration = await navigator.serviceWorker?.ready;
  if (!registration?.active) {
    /* No service worker — an unusual browser, or the very first load. The
       photos are already enqueued server-side, so nothing is lost; the upload
       simply waits for a visit when the worker is running. */
    return;
  }

  registration.active.postMessage({ type: "yaongi:enqueue", items });

  /* Background Sync is what wakes the worker after the app is killed. Where it
     does not exist (Safari), the queue drains on the next visit instead — the
     photos are still safely queued either way. */
  const sync = (registration as ServiceWorkerRegistration & {
    sync?: { register(tag: string): Promise<void> };
  }).sync;
  await sync?.register("yaongi:uploads").catch(() => {});
}

/** The digest, computed on the device so a duplicate costs no bandwidth. */
async function sha256Of(blob: Blob): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
