# 08 — Photo import: share target and upload

**What to build:** Share photos from the phone's photo app into Yaongispace and have them
arrive safely. The import path only — **browse is deliberately thin here.**

Yaongispace is a **curated library, not a backup**. Google Photos stays the archive of
record; this holds the subset worth looking at.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] PWA **share target** declared (`multipart/form-data`, `image/*`, multiple); sharing
      from the phone's photo app opens Yaongispace
- [ ] **A review grid appears first** — deselect before anything is stored. An import path
      that keeps everything by default fights the curated premise
- [ ] Upload is a **background service-worker queue that survives the app being killed** —
      the after-a-trip case is 40 photos on mobile data
- [ ] Bytes go to **Cloudflare R2**, never Supabase Storage (its egress quota is shared
      with the database — the archive could break login) and **never transit Vercel**
      ([ADR-0012](../../../docs/adr/0012-r2-for-photo-storage.md))
- [ ] Served by **signed expiring URLs**
- [ ] **Original bytes are never rewritten** — rotations and corrections become a Rendition
      or a column; deletes tombstone
      ([ADR-0013](../../../docs/adr/0013-originals-are-immutable.md))
- [ ] Renditions generated once at import with `sharp`
- [ ] **SHA-256 of original bytes, unique-indexed**: re-importing a photo already held is a
      **silent no-op with no UI**. No perceptual hashing — deliberately not built
- [ ] EXIF: **`occurred_at`, GPS and dimensions as columns; the full blob as JSON.** Nothing
      discarded — re-parsing originals out of R2 later to recover an unanticipated field is
      a one-way door
- [ ] **GPS proposes, never creates**: coordinates land in a review queue, a human confirms
      before a Place exists. No Place named "37.5665, 126.9780"
- [ ] Photos emit Entries; captions are searchable
- [ ] **Browse is a chronological grid only** — the real browse design is blocked on
      [Run the first Takeout export](../../../.wayfinder/tickets/018-run-first-takeout-export.md),
      since it differs at 15k items versus 60k

**Explicitly out of this ticket:** the Takeout backfill (a local CLI script, not a product
feature) and any near-duplicate review UI.
