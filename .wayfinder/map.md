---
label: wayfinder:map
title: Yaongispace — chart the skeleton
created: 2026-08-22
---

# Yaongispace — chart the skeleton

## Destination

A locked decision set and spec for the Yaongispace app skeleton — enough that an
implementation session can build it without re-litigating architecture. Covers six
sections (home, letters, photos, world map, calendar, knowledge base + chat agent),
Google OAuth, the bubbly zzingni/cat theme, and the shared data model the chat agent
reads across. **No app code ships from this effort.**

## Notes

- **Domain**: personal/family web app for two people — Towee (Tae Wook Kang) and
  Yangcho (Gee Eun Woo). Korea-based, Korean/English bilingual UI is fine and often
  preferred. Read `/Users/tony/workspace/yaongiworld/CLAUDE.md` first — its working
  principles are binding, especially *two users not a million*, *long-lived data*,
  *privacy by default*, and *don't over-engineer*.
- **Skills every session should consult**: `/grilling` and `/domain-modeling` for any
  decision ticket; `/research` for research tickets; `/prototype` for look-and-feel.
- **Stack precedent** (settled, don't re-open without cause): Next.js 15 + React 19 +
  Tailwind 4 + TypeScript + Supabase, matching `../llc/dashboard`. Vercel hosting,
  PWA-installable. Mobile is the primary surface; web must work but phone comes first.
- **Planning only.** Tickets resolve decisions. If a ticket makes you want to build the
  thing, you've hit the edge of the map — stop and hand off.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- **Destination and scope** (charting session, 2026-08-22) — six sections in scope
  (home, letters, photos, world map, calendar, knowledge base + chat agent); SNS and
  finance out; voice auth deferred to a future iteration; Google OAuth is primary auth;
  3D confined to the home page; zzingni assets used under private-use-only.

- [How do photos actually get into Yaongispace?](tickets/001-google-photos-ingest.md) —
  **Automatic Google Photos sync is impossible**; Google removed the library-read scopes
  on 2025-03-31 and nothing since restored them. Photos becomes an *import-and-own*
  library: direct upload as the spine, Picker API for occasional adds (60-min URLs,
  download immediately), Takeout for bulk backfill. Photos scopes are *restricted* —
  verification would demand an annual CASA assessment ($500–$75k/yr), so the app stays
  in Testing mode for photos forever.

- [How does the calendar stay in sync with Google?](tickets/002-google-calendar-sync.md) —
  Sync is technically viable (one shared Google Calendar, cron polling `events.list` with
  a `syncToken`, full resync on 410, writes in `Asia/Seoul`, skip push channels) **but
  requires sensitive-scope verification** to escape 7-day token expiry. *Superseded in
  part*: Google Calendar sync was subsequently **deferred** — Events are native to
  Yaongispace this iteration. These findings stand for whoever picks sync up later.

- [The shared data model — what is a memory, a place, a letter?](tickets/003-shared-data-model.md) —
  Entities: Person, Letter, Photo, Place, Visit, Journey, Event, Note. Unified by a
  **derived Entry index** (kind, title, body, `occurred_at`, place, person, journey,
  source pointer) rather than a polymorphic table — see
  [ADR-0001](../docs/adr/0001-entry-index-over-polymorphic-table.md). **`occurred_at` is
  the primary time axis** everywhere. **A wished-for destination is a Place with no
  Visit** — no status flag ([ADR-0002](../docs/adr/0002-place-and-visit-are-separate.md)).
  Journey groups a trip, travel-only. Person is thin (2 rows, no contact data) as a seam
  to future SNS. Fully shared ownership, no permissions. Vocabulary in
  [`CONTEXT.md`](../CONTEXT.md) — the unifier is **Entry**, never "moment" (taken by LLC).

- [How does the chat agent know our life?](tickets/004-knowledge-base-architecture.md) —
  **Recall** is a search box that speaks, not a companion: it surfaces your own Entries
  and **always shows its sources**, preferring to under-claim. Notes are pure freeform.
  **Postgres cannot tokenize Korean** — searching "제주" would never match "제주도에서" —
  so search uses **pgroonga** (the only Korean-capable option on managed Supabase), fused
  with pgvector via RRF ([ADR-0003](../docs/adr/0003-pgroonga-for-korean-search.md)). No
  vector index below ~100k rows. **Commercial AI APIs, deliberately** over self-hosting
  ([ADR-0004](../docs/adr/0004-commercial-ai-apis-over-self-hosting.md)) — a conscious
  trade against *privacy by default*, with a cheap exit. Reads photo captions, never
  images. Under $15/month.

- [Google sign-in for exactly two people](tickets/005-auth-and-accounts.md) — **Google is
  used for sign-in only** (`email`/`profile`, non-sensitive: no verification, no token
  expiry). The Photos API is **dropped** and Google Calendar sync **deferred**, so the app
  now has **no sensitive or restricted scopes at all** — one cheap Cloud project, one
  consent screen, no 7-day fuse
  ([ADR-0005](../docs/adr/0005-google-for-sign-in-only.md)). Identity is a **Person**;
  a Google account is a credential attached to one, never the owner of data
  ([ADR-0006](../docs/adr/0006-identity-is-a-person-not-a-google-account.md)). Two-account
  allowlist (as data, not a constant) plus RLS. Sessions effectively never expire — the
  phone's lock screen is the real boundary.

- [What does bubbly and fun actually look like?](tickets/006-look-and-feel.md) —
  **Soft Clay**, chosen from three built directions: warm peach→pink→lilac gradient, puffy
  white cards (24–34px radii), warm brown ink. **Light only, no dark mode.**
  **Microsoft Fluent Emoji 3D** for characters and icons (MIT, no attribution, identical
  on every device; PNG not SVG) + Phosphor/Iconoir for UI chrome. **Pretendard
  self-hosted** — `next/font/google` silently drops CJK subsets
  ([ADR-0007](../docs/adr/0007-self-host-korean-fonts.md)). One cat, one place, reacting
  rather than idling. Tab bar is primary navigation; the home shortcut grid is a warm
  secondary. Prototypes in [`prototypes/`](../prototypes/).

- [The one 3D moment on the home page](tickets/007-home-3d-moment.md) — **CSS 3D
  transforms, not WebGL.** Built all three and compared at phone size: real 3D cost ~600KB
  and a warmer battery for a difference invisible at 132px, and it needs a *modelled* cat.
  Liveliness comes from the **reaction**, not the rendering
  ([ADR-0008](../docs/adr/0008-css-3d-not-webgl.md)). **The mascot will be commissioned**
  — every emoji set is a cat *glyph*, not a mascot — and it has **moods**, swapping by app
  state. Google Noto flat cats are an explicit placeholder until then.

## Not yet specified

<!-- in-scope fog: real questions not yet sharp enough to ticket -->

- **Photo organization beyond storage.** Albums vs. timeline vs. auto-grouping by
  place/date, and whether faces/search matter. Now unblocked in principle — photos
  arrive by import — but wants the import experience settled first.
- **Letters as an experience.** Whether letters are plain text or have paper/stamp/seal
  texture, whether they can be scheduled or sealed until a date. Wants a prototype.
- **Google Calendar sync.** Deferred, not cancelled. The research in
  [ticket 002](tickets/002-google-calendar-sync.md) still stands, and
  [ticket 012](tickets/012-oauth-verification.md) holds the verification checklist.
  Picking this up means accepting sensitive-scope verification. The data model is
  designed so sync arrives as a mirror onto Events we already own.
- **Offline behaviour.** How much works on a phone with no signal.
- **Backup and export.** Concrete mechanism honouring *long-lived data* — how the two
  of you get everything out if Supabase or Vercel disappears.

## Out of scope

<!-- ruled beyond the destination; never graduates -->

- **Personal SNS / relationship management** — registering friends and family, logging
  events to manage interpersonal relationships. Ruled out of this iteration; deserves
  its own map once the app exists.
- **Finance** — the financial situation dashboard, the assistant, and API-connected
  account syncing. Out for this iteration. Bank aggregation in Korea (Open Banking /
  MyData) is a regulated, licensed problem and needs its own effort entirely.
- **The Google Photos API.** Automatic sync does not exist — Google removed the
  library-read scopes on 2025-03-31, and the Picker API needs a human tapping a
  Google-hosted UI each time, with URLs that expire in 60 minutes. Keeping the Picker
  would have cost a second Cloud project and weekly re-consent for an occasional
  convenience. Photos arrive by PWA share target and scheduled Takeout instead, touching
  no Google API. Ruled out consciously, not overlooked.
- **Third-party character art (zzingni).** *Retired as a constraint, 2026-08-22.* The
  charting session recorded zzingni emoticons as private-use-only, which meant the app
  could never be public, listed, or shown in Yangcho's MBA portfolio. With the mascot now
  being **commissioned as an original** ([ticket 017](tickets/017-commission-the-yaongi.md)),
  that restriction no longer binds once the commission lands. Fluent and Noto assets used
  meanwhile are MIT and Apache-2.0 — both fine in public. **Nothing in the app need depend
  on third-party character IP.**
- **Voice authentication ("Yaongichu!")** — deferred to a future iteration. Research is
  already done and should not be repeated; see the closed research ticket for the
  findings brief. Bottom line for whoever picks this up: managed speaker verification
  is dead (Azure retired 2025-09-30, AWS Connect Voice ID end-of-support 2026-05-20),
  voice is not a defensible standalone factor in the era of cheap cloning, and phrase
  recognition carries zero security. Build it as a *ritual* on top of passkey/OAuth,
  never as the lock. `MediaRecorder` + server-side STT is the reliable capture path —
  WebKit's `SpeechRecognition` is buggy, notably in home-screen PWAs.
