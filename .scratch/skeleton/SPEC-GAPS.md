# Spec gaps — acceptance criteria not met by the skeleton

From the two-axis code review of tickets 02–08. Everything here is a ticket
checkbox that is **not** actually satisfied by the merged code, verified against
the code rather than the commit messages. Fixed items are recorded in git; this
file is what remains.

Deliberate exclusions (Recall, world map, Takeout backfill, AI letter
suggestions, generated designs, near-duplicate review, browse beyond a grid) are
**not** listed — they are out of scope by the tickets' own words.

## Fixed during review

- **The import route documented a check that never ran.** `mergePhotoMetadata`
  was written and tested but uncalled, so Null Island `(0,0)` became a
  `place_proposal` and any parseable date became the primary time axis. Now
  wired, with a test that pins the wiring. (`cdc8185`)
- **`imminent_event` read the Entry index around RLS.** A view runs as its owner
  unless it declares `security_invoker`, and the view left-joins `entry`, which
  carries sealed Letters. Measured: 0 rows direct, 1 through the view.
- **Three copies of `asPerson`, three of `currentPersonId`, two of
  `koreanDate`** — consolidated.

## Open — genuine unfinished work

### 1. The last-seen marker does not trim the feed (ticket 06)
> "A **stored last-seen timestamp per Person** trims the feed."

`person.news_seen_at` is written by `see_news()` and read by `newsSeenAt()`,
which **has no callers**. The `news` view filters on person and the 30-day
window only. Consequence: the related criterion — *"a rebuild must not
resurrect dismissed news"* — is only half-proved. The test shows the marker
survives a rebuild, but since nothing is ever dismissed **from the feed**, the
resurrection case cannot currently be exercised.

### 2. A Journey never shows the Events inside its span (ticket 07)
> "A Journey **adopts** Events by date range — opening a Journey shows the
> Events inside its span."

`journey_events()` and `eventsInJourney()` are implemented and tested, but
**no Journey route exists in `app/`**. The function's own docstring concedes it
is waiting for the Photos section to build that view — and no ticket in the
skeleton owns it. The database half is done; the "opening a Journey" half has
nowhere to happen.

### 3. Scrolling up reaches one month, not the past (ticket 07)
> "The past is reachable by **scrolling up**; Events do not vanish when they
> happen."

`widenWindow` exists and is tested; nothing calls it. The page fetches one
window server-side and `scrollerRef` is attached but never read. One month back
is reachable, so the criterion is partly met — the comment claiming otherwise
is corrected in `f3809d0`.

### 4. EXIF is JPEG-only, so iPhone photos arrive bare (ticket 08)
> "EXIF: **`occurred_at`, GPS and dimensions as columns; the full blob as
> JSON.** Nothing discarded."

`lib/photos/exif-client.ts` parses JPEG only and returns null for anything else.
**HEIC is the iPhone default**, and Yangcho is on iPhone — so her photos import
with null `occurred_at`, null GPS and an empty blob, silently. The server-side
parser (`lib/photos/exif.ts`, `sharp`-based, would handle HEIC) is currently
unreferenced outside tests.

This is the one open gap that quietly loses data we cannot recover later without
re-reading originals out of R2 — which the ticket calls a one-way door.

### 5. A Photo cannot be deleted (ticket 08)
> "deletes tombstone"

`photo.deleted_at` exists and is honoured on read, but every write to it is in
tests. There is no delete action anywhere in the app.

### 6. Captions cannot be written (ticket 08)
> "Photos emit Entries; captions are searchable."

Indexing is correct; the review grid has no caption field and the service worker
never sends one. Searchable, but unwritable.

### 7. Session-less navigation regressed (ticket 04)
> "Navigation works with no session (sections may be empty), so this is
> verifiable before 02 lands."

`app/page.tsx` and `app/letters/page.tsx` now `redirect("/sign-in")`. Introduced
by tickets 05/06 and arguably correct once auth exists — but ticket 04's
checkbox is false as written, and it should be ticked or re-worded deliberately.

## Worth a decision, not obviously a defect

- **`R2Storage.remove()`** is a presigned DELETE guarded only by prose
  ("Renditions only, and the type cannot enforce that"). Currently uncalled. One
  careless call site from violating ADR-0013's *originals are never rewritten*.
  Consider making the type enforce it.
- **The stored SHA-256 is the phone's claim**, regex-validated but never
  recomputed — even though the server already holds the bytes for renditions.
  The spec says "SHA-256 of original bytes"; today it is "of the bytes the phone
  says it sent". Cheap to close where `fetchOriginal` already runs.
- **Calendar queries as the database owner** (see POST-WAVE-NOTES.md note 1).
  Not a leak — Events are shared by design — but it is the one section that
  opted out of the mechanism the others use.
- **Android launcher shortcuts** in the manifest were not asked for. Harmless;
  the in-app home page is correctly free of a shortcut grid.
