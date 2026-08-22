---
id: 011
title: Where does it live, and how do we get our data out?
label: wayfinder:grilling
status: closed
assignee: session-2026-08-22-i
closed: 2026-08-22
blocked-by: [001]
---

## Question

Stack is settled (Next.js + Supabase + Vercel, PWA-installable). What is *not* settled
is photo storage, which is where the `long-lived data` and `avoid lock-in` principles
actually bite.

- Photo storage: Supabase Storage vs. S3/R2 vs. self-hosted. Decades of family photos
  and video is the real cost driver. Model the actual bill at a realistic volume, not
  a toy one.
- Originals vs. derivatives — what's kept at full fidelity, what's generated, and
  whether originals are ever touched. For a keepsake archive, originals should be
  immutable.
- **The exit path.** If Supabase or Vercel vanishes or gets expensive, how do the two
  of you get everything — photos, letters, notes, places — out in a usable form? This
  is a binding principle, so treat it as a requirement, not a nice-to-have.
- Backup: what protects against accidental deletion and against provider failure.
  Photos and letters are irreplaceable in a way that most app data is not.
- Free-tier limits and what happens the day one is exceeded.

Blocked on the photos research, since how photos arrive shapes what has to be stored.

## Answer (2026-08-22)

**Yaongispace is a curated library, not a backup.** This is the decision that reshaped
the ticket. Google Photos remains the archive of record for the raw 139GB; Yaongispace
holds only the subset worth looking at. Storage cost therefore stopped being the
deciding factor — at curated volume every vendor is pocket change — and the decision
fell to coupling and exit instead.

### Photos and video live on Cloudflare R2

Priced at realistic volume, including the $25 Supabase Pro plan already being paid for
Postgres and auth:

| | 500GB | 2TB | Catch |
|---|---|---|---|
| **Cloudflare R2** | +$7/mo | +$30/mo | Zero egress, ever. Pure S3 API. |
| Backblaze B2 | +$3.50 | +$14 | Free egress capped at 3x stored |
| Supabase Storage | +$8.50 | +$41 | **Egress shared with the database** |
| AWS S3 | +$11.50 | +$46 | Egress is the exit tax by design |

R2 is not the cheapest — B2 is half the price — but it is the only option where reading
the archive back has **no meter at all**. For data meant to last decades and be migrated
at least once, zero egress is not a discount; it is the removal of the exit toll. B2's
3x cap is precisely the limit you would hit on the day you tried to leave.

Two findings ruled out Supabase Storage independently of price:

- **Its egress quota is shared** across database, auth, API, edge functions and storage.
  Media is the only thing that could plausibly exhaust it, and the failure would land on
  login and the database — the archive would be able to break the app.
- **Hosted Supabase cannot point at your own bucket.** BYO S3 works only self-hosted;
  compatibility runs outbound, not in. "Supabase Storage now, swap the backend later" is
  not available — moving would mean rewriting the storage layer.

Supabase keeps Postgres and auth. R2 holds bytes. See
[ADR-0012](../../docs/adr/0012-r2-for-photo-storage.md).

### Originals are write-once

Original bytes are **never rewritten in place**. Rotating a photo or fixing a wrong date
produces a derivative plus a database field, never a mutation of the original. Deleting a
Photo tombstones rather than erases. This is the defining property of a keepsake archive
and the one that is expensive to retrofit. See
[ADR-0013](../../docs/adr/0013-originals-are-immutable.md).

### Thumbnails are generated once, at import

Renditions are produced with `sharp` at import and stored in R2 alongside the original.
Supabase's image transformation only works on its own buckets (unavailable to us), and
Vercel's optimizer now meters transformations, cache reads *and* cache writes — a scroll
through the library would bill on every miss. Generating once makes the hosting bill flat
regardless of browsing, and means the export contains usable thumbnails rather than only
multi-megabyte originals.

### Bytes never transit Vercel

Storage sits behind a CDN; the app issues **signed, expiring URLs** and the bytes go
straight from R2 to the device. Not public URLs — *privacy by default* rules out
guessable ones. This keeps the app's hosting cost independent of how much the library is
browsed.

### The exit path is a standing export, not a documented procedure

*Avoid lock-in* is binding, so the exit is a **continuously-maintained second copy** for
the irreplaceable things, on a schedule — not a script someone remembers to run. Derived
data (the Entry index, thumbnails) is rebuildable and gets no standing copy.

The export is written in **two layers**, because they cost nearly the same to produce:

1. **Human-readable** — photos in dated folders, Letters and Notes as individual Markdown
   files, Places as GeoJSON/CSV. This is the layer that actually honours *long-lived
   data*: it outlives Postgres, Supabase and this app, and either of you could read it in
   ten years without a developer.
2. **Lossless** — a `pg_dump` plus original files, able to rehydrate the app.

**What the export must carry is the curation, not just the bytes.** Because Google Photos
holds the originals, the copy in Yaongispace is not the only copy — but the *selection*
is. Which photo out of eleven near-identical ones is the good one is judgement no other
backup holds. The export is therefore only complete if it carries the selection and the
metadata.

`rclone` handles every provider involved, so nothing here is a one-way door at the byte
level.

### The offsite mirror was considered and dropped

A Hetzner Storage Box (EUR 10.90/mo, 5TB, flat) was recommended and then **withdrawn** once
the archive turned out to be curated. It would be ~EUR 11/month to protect data Google
already holds the originals of. Revisit only if Yaongispace ever becomes the only copy.

### Paid from day one

Budget roughly $30-35/month all-in, not $0. Designing to squeeze under a free tier
betrays *long-lived data*, and the failure mode — the archive silently refusing uploads
or deleting — is the one genuinely unacceptable outcome.

### Note for the import ticket

The raw library is **139GB**, but the curated seam already exists: the albums at
`photos.google.com/albums` are four years of hand-curation, already done. Albums are
**not reachable by any API** — the library-read scopes are gone — but **Takeout preserves
album structure**, exporting a folder per album plus `.json` sidecars carrying real dates
and GPS. So the monthly ritual is: keep putting good photos into albums as always;
Takeout drops an export every month or two; the app imports what is new in those albums.
The existing habit becomes the curation UI. Consequence to design around: an album
selection does not reach the app until the next export — a real latency, acceptable for an
archive, but the app must never present itself as a live mirror of the albums.
