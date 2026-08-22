---
id: 013
title: How importing photos should feel
label: wayfinder:grilling
status: closed
assignee: session-2026-08-22-j
blocked-by: [001, 003, 005, 011]
closed: 2026-08-22
---

## Question

The photos research killed automatic sync, so importing is now a thing the two of you
*do* rather than something that happens invisibly. That makes it a UX question, and a
load-bearing one — if importing is tedious, the library dies and the app's most
valuable section with it.

Decide:
- **Settled by the auth ticket: the Picker API is dropped.** Photos arrive by two paths
  only — a **PWA share target** (share from the phone's photo app, two taps) and
  **scheduled Takeout** for backfill. No Google API is involved in either, which is why
  the app now has no sensitive scopes at all. This ticket designs the *experience* of
  those two paths, not which paths exist.
- The share-target flow specifically: what the PWA manifest must declare, what happens
  when 40 photos are shared at once, and what the user sees while it uploads.
- What the routine looks like — after a trip, do you dump 300 photos at once? Does the
  app nudge you? Is importing an occasional ritual or a background chore?
- The Takeout backfill: is the pre-app archive imported once at the start, and who does
  it? This may be a one-time task ticket rather than a product feature.
- Duplicate handling across three ingestion paths hitting the same photo.
- EXIF handling — dates and GPS survive via Takeout sidecars and direct upload, and
  feed map pins. Decide what's extracted and stored at import.
- What the user sees while 300 photos upload from a phone on mobile data.

Blocked on the photos research (closed — read it) and the data model.

## Settled upstream by ticket 011 (2026-08-22)

Storage is decided — R2, signed URLs, `sharp` renditions at import, originals immutable
([ADR-0012](../../docs/adr/0012-r2-for-photo-storage.md),
[ADR-0013](../../docs/adr/0013-originals-are-immutable.md)). Two product facts came out
of that session that this ticket should start from rather than rediscover:

**The library is curated, not complete.** Yaongispace holds only the subset worth looking
at; Google Photos stays the archive of record. The raw library is **139GB** and most of it
is not wanted. Near-identical shots should collapse to one kept copy, and **the user makes
the final call** — so this ticket owns designing that review pass (perceptual hashing, a
similarity threshold, and a UI for picking the keeper).

**The albums are the curation seam.** `photos.google.com/albums` already holds four years
of hand-curation. Albums are **not reachable by any API** — the library-read scopes are
gone — but **Takeout preserves album structure**, exporting a folder per album plus
`.json` sidecars with real dates and GPS. So the ritual is: keep putting good photos into
albums as always; Takeout drops an export every month or two; the app imports what is new
in those albums. The existing habit becomes the curation UI.

Design around this consequence: **an album selection does not reach the app until the next
export.** That latency is acceptable for an archive, but the app must never present itself
as a live mirror of the albums.

Sizing question still open: at 139GB, four years is likely 15k-60k items. Nearer 15k, the
first review pass is an evening; nearer 60k it must be chunked by year or by Journey or it
will never get done. Worth measuring from the first export before designing the flow.

**The user asked to prototype against the albums** — carry that into this ticket.

## Resolution (2026-08-22)

**Journeys are the spine of the Photos section, and importing is a review-then-queue
flow that never blocks on the network.** Nine questions were put to the user and
accepted; the tenth answer — "theme the app around Trips/Journeys instead of albums" —
reshaped the tree and forced three more.

### Journey replaces album as the organizing idea

A Google Photos **album is a Takeout-boundary word, never an app concept**. On import an
album folder becomes a **Journey**, named from the folder, **created automatically** and
editable afterward (merge, rename, dissolve). The user already did this curation by hand
over four years; making them re-confirm it in a review screen is exactly the tedium this
ticket exists to prevent.

This does **not** contradict "EXIF proposes, never creates"
([ticket 008](008-world-map.md)). That rule guards *Places*, where coordinates are
machine-guessed and a wrong guess litters the map. An album name is a human decision
already made; importing it is carrying the decision across, not inventing one.

Journey was **travel-only** and is now **widened to a named span of our life**
([ADR-0014](../../docs/adr/0014-journey-is-a-named-span-of-life.md), `CONTEXT.md`
amended). Four years of albums are not all trips; the alternatives were a second grouping
noun beside Journey — the vocabulary rot `CONTEXT.md` exists to prevent — or letting the
best-curated non-trip albums dissolve into an undifferentiated timeline.

**The timeline is the substrate; Journeys are lenses over it.** A share-target photo
belonging to no Journey is a normal Photo. If its `occurred_at` falls inside an existing
Journey's span it attaches silently; otherwise it just lands. The share flow is never
blocked by a "which Journey?" picker — two taps was the whole point.

### The share target: review, then background queue

Manifest declares a `share_target` (`multipart/form-data`, `image/*`, multiple). On
receipt the app shows **a grid to deselect from before anything is stored**, then queues
the kept items for **background upload**. An import path that stores everything by
default fights the premise that the library is curated; a blocking progress bar loses the
batch when the app is closed on mobile data after a trip.

Implementation cost named now: this needs a **service worker queue that survives the app
being killed**. It is the one genuinely fiddly piece of the flow.

### EXIF: two columns, one blob, nothing discarded

`occurred_at` and GPS get **real columns** — they are queried, and `occurred_at` is the
primary time axis. Dimensions get a column too, because layout needs them before the
image loads. **The full EXIF blob is stored as JSON** and never queried: re-parsing
tens of thousands of originals out of R2 to recover a field we failed to anticipate is
the one-way door *long-lived data* warns about.

GPS **proposes, never creates** — coordinates land in a review queue, Photon can suggest
a name, a human confirms. Stated explicitly here so an implementation session reading
both tickets cannot pick the softer reading.

### Duplicates: exact is automatic, near-identical is deferred

**SHA-256 of the original bytes, unique-indexed.** A hash match is a no-op with no UI at
all — re-importing a photo you already own does nothing, silently, across all paths.

**Near-duplicate review is cut from this ticket.** It is a *curation* feature, not part of
the import path, and building a similarity UI before knowing whether near-duplicates
actually bother the user is over-engineering. No perceptual algorithm or threshold is
chosen — deliberately.

### The Takeout backfill is a script, not a feature

Takeout zips land on a **laptop**, not a phone, and the phone is the app's primary
surface. The backfill is a **local CLI script** — reads the export, merges the `.json`
sidecars (borrow `immich-go`'s logic), uploads to R2, writes rows. Far easier to re-run
when it dies halfway through 60GB, which it will. The share target is the product; the
backfill is plumbing. If the recurring ~2-month exports keep needing it, it earns a
scheduled wrapper later.

### Importing is passive, with one hook

**No nagging.** Two people do not need a chore app, and a generic "you haven't imported
in a while" notification trains you to mute the app's other notifications — which
[ticket 014](014-notification-model.md) is about to design. The single exception: **after
a Journey's dates pass**, the app may ask once whether photos from it should come in.

### What this ticket could not answer, and why

The review-pass sizing question is **unanswerable by anyone right now**. A sub-agent
searched the repo and filesystem: the library has **never been measured**, no Takeout
export exists on this machine, and the 15k–60k bracket is inferred from a 139GB figure
whose own derivation is **unrecorded** (it may be total Google One usage, including Drive
and Gmail). The ticket's own note says to measure from the first export before designing
the flow, and it is right.

So the measurement is split out as
[Run the first Takeout export](018-run-first-takeout-export.md), and the review-pass
design **graduates from fog once the export lands** — consistent with deferring
near-duplicate review above. Nothing else in this ticket depended on the count.

Nothing currently depends on 139GB being precise — ADR-0012 chose R2 for coupling
reasons, not cost — but it should stop being an unsourced number repeated in five files.
The task ticket records where it came from.
