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
  Viable: one dedicated shared Google Calendar, Vercel Cron polling `events.list` with a
  `syncToken`, full resync on 410, writes explicitly in `Asia/Seoul`. Skip push channels.
  **But** Testing-mode refresh tokens expire after 7 days, so always-on sync *requires*
  sensitive-scope verification (3–5 days, no CASA, achievable). Consequence: the app runs
  **two OAuth postures** — calendar verified in Production, photos unverified in Testing.

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

## Not yet specified

<!-- in-scope fog: real questions not yet sharp enough to ticket -->

- **Photo organization beyond storage.** Albums vs. timeline vs. auto-grouping by
  place/date, and whether faces/search matter. Now unblocked in principle — photos
  arrive by import — but wants the import experience settled first.
- **Recall mechanics.** Embeddings vs. full-text vs. structured query over the Entry
  index; model choice; cost. Now sharper — it is retrieval over one index, not six
  tables — but still belongs to the KB architecture ticket.
- **Letters as an experience.** Whether letters are plain text or have paper/stamp/seal
  texture, whether they can be scheduled or sealed until a date. Wants a prototype.
- **Offline behaviour.** How much works on a phone with no signal.
- **Bilingual strategy.** Whether UI is Korean-first, English-first, or switchable.
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
- **Voice authentication ("Yaongichu!")** — deferred to a future iteration. Research is
  already done and should not be repeated; see the closed research ticket for the
  findings brief. Bottom line for whoever picks this up: managed speaker verification
  is dead (Azure retired 2025-09-30, AWS Connect Voice ID end-of-support 2026-05-20),
  voice is not a defensible standalone factor in the era of cheap cloning, and phrase
  recognition carries zero security. Build it as a *ritual* on top of passkey/OAuth,
  never as the lock. `MediaRecorder` + server-side STT is the reliable capture path —
  WebKit's `SpeechRecognition` is buggy, notably in home-screen PWAs.
