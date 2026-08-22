---
id: 001
title: How do photos actually get into Yaongispace?
label: wayfinder:research
status: closed
assignee: charting-session
closed: 2026-08-22
blocked-by: []
---

## Question

The original brief says photos are "automatically synced from Google Photos". Google
restricted the Photos Library API in March 2025, so that premise may no longer hold.

Establish: which scopes still exist and what they grant; how the Picker API flow works
and whether it can support ongoing sync or is strictly one-time user-driven; whether
ANY sanctioned path exists for continuous mirroring; and what the realistic
alternatives are (Takeout, direct device upload, Immich/PhotoPrism, third-party tools).

Also: what Google's OAuth verification demands if restricted scopes are used, and
whether a 2-user app in testing mode can avoid it — including any token-expiry catch
that would break an always-on sync.

Output is a findings brief plus a bottom-line recommendation for how a 2-person private
app should get photos into its own library in 2026.

---

## Resolution (2026-08-22)

**Automatic sync from Google Photos is not possible. The premise is dead.**

Google removed `photoslibrary.readonly`, `photoslibrary.sharing` and the broad
`photoslibrary` scope effective **2025-03-31**; those calls now return
`403 PERMISSION_DENIED`. The only surviving Library API scopes are app-created-data
only (`appendonly`, `readonly.appcreateddata`, `edit.appcreateddata`). **No scope
remains that reads a user's pre-existing library** — an app cannot see photos taken on
your phone and backed up by the native Google Photos app.

### The Picker API is one-time, not a subscription

`photospicker.mediaitems.readonly` lets a user select existing items through a
Google-hosted UI: create session → user picks → poll until `mediaItemsSet=true` → list
items, each with a `baseUrl` for raw bytes.

Two hard constraints: **`baseUrl` expires ~60 minutes** after issue and Google says not
to store it, so bytes must be downloaded into our own storage immediately; and there is
**no webhook or polling for newly-added photos** — every import needs the user to open
the picker again.

### No sanctioned background path exists

- Library API — cannot read pre-existing content at all.
- Picker API — requires a live user session; URLs die in an hour.
- Drive API — Photos and Drive were decoupled years ago; Drive cannot see the library.
- Takeout — a batch job, not an API (below).

### Takeout gained scheduling (2026-06), but it is still a batch job

Google added incremental Takeout for Photos: one baseline export, then automatic
follow-ups (~every two months, up to a year), ~50GB/export, delivered as zips to
email/Drive. Configured by hand in Takeout's UI — not callable from our app.

**Metadata catch**: Google strips/alters embedded EXIF on ingestion. Takeout ships
photo files plus separate sidecar `.json` files carrying the real dates, GPS and album
membership — these must be merged back manually. `immich-go` already solves this and
its logic is worth borrowing.

### The verification trap (applies to calendar too)

Photos scopes are **restricted**, which for a verified production app mandates OAuth
verification *plus an annual CASA security assessment* — roughly **$500 to $75,000+ per
year**, paid to a third-party assessor. Absurd for two people.

The escape is staying in OAuth **Testing** mode (up to 100 test users). The cost:
**refresh tokens expire after 7 days**, forcing weekly re-consent. Tolerable for a
manual "pick photos" action; fatal for anything silent — which independently confirms
background sync is off the table regardless of scope.

### Recommendation — three ingestion paths, in priority order

1. **Direct upload as the primary path** — mobile share-sheet / PWA file picker. No
   restricted scope, no verification, no token games, never breaks. Boring and durable,
   which is what the archive actually needs.
2. **Picker API for occasional "add from Google Photos" moments** — stay in Testing
   mode, accept weekly re-auth, download bytes into storage before the 60-minute
   window closes.
3. **Takeout for bulk backfill** — the one-time import of everything from before the
   app existed, plus occasional catch-up. Merge the `.json` sidecars on import.

### Consequences for the map

- The photos section is an **import-and-own library**, not a mirror of Google Photos.
  This is arguably better against *long-lived data*: the photos genuinely live in our
  storage rather than depending on a Google API that already broke once.
- Storage volume is now entirely ours to carry — feeds directly into
  hosting-and-storage.
- EXIF (dates, GPS) survives via Takeout sidecars and direct upload, so deriving map
  pins from photo location remains viable.
