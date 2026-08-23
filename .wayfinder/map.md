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
  Journey groups a trip, travel-only *(superseded — widened to any named span of our life
  by [ADR-0014](../docs/adr/0014-journey-is-a-named-span-of-life.md))*. Person is thin (2 rows, no contact data) as a seam
  to future SNS. Fully shared ownership, no permissions. Vocabulary in
  [`CONTEXT.md`](../CONTEXT.md) — the unifier is **Entry**, never "moment" (taken by LLC).

- [How does the chat agent know our life?](tickets/004-knowledge-base-architecture.md) —
  **Recall** is a search box that speaks, not a companion: it surfaces your own Entries
  and **always shows its sources**, preferring to under-claim. Notes are pure freeform.
  **Postgres cannot tokenize Korean** — searching "제주" would never match "제주도에서" —
  so search uses **pgroonga** (the only Korean-capable option on managed Supabase), fused
  with pgvector via RRF ([ADR-0003](../docs/adr/0003-korean-aware-search.md)). No
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

- [Places we've been and places we want to go](tickets/008-world-map.md) — The map is a
  **portal biased to record**: the only view organised by place. **Two renderers** — a
  d3-geo **SVG globe** (~45KB, no WebGL, no render loop) for the world view, **MapLibre +
  Protomaps** for the place view ([ADR-0010](../docs/adr/0010-svg-globe-and-flat-map.md));
  this does not reopen ADR-0008, which rejected 600KB of three.js. Every option is *free*
  at two users, so licensing decided it: **Google and Mapbox both forbid storing geocoded
  coordinates permanently** and restrict offline caching, so geocoding is **Photon** (OSM,
  no display restriction, coordinates are ours) and tiles are self-hosted `.pmtiles`
  ([ADR-0009](../docs/adr/0009-maplibre-protomaps-and-osm-geocoding.md)). Style is a JSON
  file in the repo — Soft Clay by editing tokens. Exact coordinates, clustered on zoom.
  **Search-and-pick is the spine; EXIF proposes, never creates.** Wishes share the map as
  hollow pins. A Place opens as its **Visits**, each expanding to its Entries.

- [What is a letter, and how does writing one feel?](tickets/009-letters.md) — A letter is
  **sealed (봉하기), not sent** — **editable until read, then immutable**, so the recipient
  never sees a letter change under them. **Sealed-until-a-date is real.** The paper-vs-clay
  question *dissolved*: the design is **generated per letter** from a mood prompt plus the
  letter's own text, so both exist and the writer picks; a sealed letter keeps its design
  forever, which is what makes the archive worth scrolling. The ticket's binding "the agent
  never writes letters" was **consciously amended** to **suggest-only, never auto-apply** —
  the app underlines and offers, nothing changes without a tap, and the scope line is
  **errors, not voice** ([ADR-0011](../docs/adr/0011-ai-suggests-in-letters-never-writes.md)).
  Design generation sends letter bodies to a commercial API — a *wider* exposure than
  ADR-0004 authorised, accepted knowingly. Body face **Gaegu** (OFL); Ownglyph ruled out.
  Prototype: [`letters.html`](../prototypes/letters.html).

- [Where does it live, and how do we get our data out?](tickets/011-hosting-and-storage.md) —
  **Yaongispace is a curated library, not a backup.** Google Photos stays the archive of
  record (raw library: **139GB**); the app holds only the subset worth looking at, and the
  **albums** are the curation seam already built by hand over four years. That reframing
  made cost a non-factor, so coupling decided instead: photos live on **Cloudflare R2**,
  because Supabase's egress quota is **shared with the database** (the archive could break
  login) and hosted Supabase **cannot point at your own bucket**, making it a one-way door
  ([ADR-0012](../docs/adr/0012-r2-for-photo-storage.md)). R2 over the cheaper B2 for **zero
  egress with no cap** — B2's 3x cap bites precisely on the day you leave. **Original bytes
  are never rewritten**; edits become a Rendition or a stored correction, and deletes
  tombstone ([ADR-0013](../docs/adr/0013-originals-are-immutable.md)). Renditions generated
  once at import with `sharp`; bytes never transit Vercel, served by **signed expiring
  URLs**. The exit is a **standing scheduled export in two layers** — human-readable
  (dated folders, Markdown letters, GeoJSON places) and lossless (`pg_dump` + originals) —
  and it must carry **the selection**, which is the part no other backup holds. An offsite
  Hetzner mirror was recommended, then **withdrawn** once the library turned out curated.
  Paid from day one, ~$30-35/month.

- [How importing photos should feel](tickets/013-photo-import-experience.md) — **Journeys
  are the spine of the Photos section.** A Google Photos **album is a Takeout-boundary
  word, never an app concept**: an album folder becomes a **Journey**, named from the
  folder, created **automatically** and editable after (the curation was already done by
  hand — re-confirming it is the tedium this ticket exists to prevent). This does not
  reopen "EXIF proposes, never creates", which guards *Places*, where coordinates are
  machine-guessed. **Journey widened from travel-only to a named span of our life**
  ([ADR-0014](../docs/adr/0014-journey-is-a-named-span-of-life.md), `CONTEXT.md` amended)
  — four years of albums are not all trips, and the alternatives were a second grouping
  noun or letting the best-curated ones dissolve. **The timeline is the substrate;
  Journeys are lenses over it.** Share target = **review grid, then background upload**
  (needs a service worker queue surviving app kill); never blocked by a Journey picker.
  EXIF: `occurred_at`, GPS and dimensions as **columns**, full blob as **JSON**, nothing
  discarded. Duplicates: **SHA-256, exact matches are a silent no-op**; near-duplicate
  review **cut** — deliberately no perceptual algorithm chosen. Takeout backfill is a
  **local CLI script**, not a product feature. Importing is **passive** — no nagging, one
  optional prompt after a Journey's dates pass. The **review-pass design could not be
  answered**: the library has never been measured, so it is split to
  [Run the first Takeout export](tickets/018-run-first-takeout-export.md).

- [What counts as news worth telling us about?](tickets/014-notification-model.md) —
  **News is a derived feed with stored read state, ordered by arrival**
  ([ADR-0015](../docs/adr/0015-news-is-a-derived-feed.md)). No notifications table; the
  feed is a query over recent Entries. But read state **is** stored — a last-seen
  timestamp per Person — because Entry is itself derived, so deriving read state too
  would make a rebuild **resurrect dismissed news**. **News is the one exception to
  `occurred_at`**: it sorts by `created_at`, since a letter written today about last
  October would otherwise sort into October and a Takeout backfill would flood the feed
  with 2022 (`CONTEXT.md` amended). Everything is newsworthy but **collapses by Journey,
  else by day** — available only because ticket 013 made Journeys the spine; a Letter is
  never grouped. Always the other person (`person_id != me`). **Feed-read and
  letter-read are deliberately separate** — seeing a letter mentioned must never seal it,
  only opening it does. A sealed letter's news fires on its **unseal date**. **Push
  deferred, not discarded** (in-app only; the sealed-until-a-date letter is what will
  justify it later). The feed is a rolling ~30 days, **not** a history.

- [What greets you when you open the app?](tickets/010-home-and-notifications.md) —
  **Home is a hearth: the cat is the content, News is the caption.** Not a dashboard —
  News shows only the *other* person's doing over ~30 days, so it is often one line and
  frequently zero, and a feed-shaped page built on that **looks broken on a normal day**.
  Inverting it makes the quiet case the design rather than a degraded version of it. A
  quiet Tuesday shows a **warm nothing** ("조용한 하루"), never silence and **never a
  prompt** — a home page that wants things from you is the import-nagging instinct again.
  **The shortcut grid is dropped** (ticket 006 handed this ticket that call): it duplicates
  the tab bar and would push the cat below the fold. The cat sits upper-centre and
  **navigates nowhere** — tap gets a squash-and-sparkle, nothing more. **Mood mirrors the
  top News item**, time-of-day as fallback, so cat and caption read from one source and
  cannot contradict. **A sealed letter is invisible until its date** — a countdown leaks
  that something is coming. *Consequence*: Calendar now has **no navigation entry at all**,
  recorded on [A shared calendar that is ours](tickets/016-calendar-section.md).

- [What language does Yaongispace speak?](tickets/015-bilingual-strategy.md) —
  **Korean-first, no switcher**, and **nothing in the data model knows what a language
  is.** UI chrome is hardcoded Korean: a toggle is i18n infrastructure (catalogs, locale
  context, every string indirected) built for a user who does not exist. The MBA portfolio
  does not change it — a Korean UI reads as a real thing built for real people. **No
  `language` column anywhere**; mixed and code-switched content is the normal case, and
  tagging an Entry `ko`/`en` would be wrong for most real content and would tempt a later
  session to branch on it. Dates in Korean convention ("2026년 8월 22일"), relative for the
  recent past ("3일 전"), `Asia/Seoul`. Names are the yaongi names in Korean — **토위** and
  **양초** — one thin display field, not a name-per-language structure. **Recall answers in
  the question's language but never translates a quoted source** — translating a letter
  would silently put words in your spouse's mouth, which the "search box that speaks, not a
  companion" framing exists to prevent. **Generated letter designs must never render
  text** (recorded on [ticket 009](tickets/009-letters.md)) — generated Hangul is garbled,
  and this is a keepsake.

- [A shared calendar that is ours](tickets/016-calendar-section.md) — **An agenda of what
  is coming, on the sixth tab.** Calendar takes the navigation slot that dropping the
  shortcut grid left empty — five items was the count that fell out of ticket 006, not a
  designed limit. **Agenda only, no month grid, not even as a toggle**: for two people a
  month view is twenty-seven empty cells and chrome, and the grid is the half that would
  rot unused; the past is reachable by scrolling up. **A yearly repeat flag, not RRULE** —
  anniversaries recur, essentially nothing else does, and RFC 5545 recurrence is large
  machinery. **Neither Events nor Journeys create each other**; a Journey *adopts* Events
  by date range as it does Photos, preserving ADR-0014's "Journeys are optional".
  **Reminders are News and nothing else** — one channel, so the cat's mood reacts to an
  approaching anniversary for free. **No native-calendar sync**: an `.ics` feed was viable
  and cheap but ruled out on behaviour — iOS polls every 5 minutes while Google refreshes
  external ICS on its own ~8–24h schedule with **no manual refresh at either end**, and
  with Yangcho on iPhone and Towee on Android the mirror would be near-live for one of us
  and a day stale for the other. The ICS mechanics are kept on the ticket for whoever
  revisits it alongside deferred Google sync.

## Not yet specified

<!-- in-scope fog: real questions not yet sharp enough to ticket -->

- **The photo review pass and browse design.** Narrowed twice and now waiting on a
  measurement, not a decision. Ticket 011 established the library is **curated**; ticket
  013 settled that **Journeys are the spine** and cut near-duplicate review from the
  import path deliberately. What remains: how the kept subset is *browsed* beneath the
  Journey lens, and whether near-identical shots need a collapse UI at all. **Blocked on
  [Run the first Takeout export](tickets/018-run-first-takeout-export.md)** — near 15k
  items the first pass is an evening, near 60k it must be chunked by year or by Journey,
  and that is a different design rather than the same one scaled. Whether faces matter is
  still untouched.
- **Google Calendar sync.** Deferred, not cancelled. The research in
  [ticket 002](tickets/002-google-calendar-sync.md) still stands, and
  [ticket 012](tickets/012-oauth-verification.md) holds the verification checklist.
  Picking this up means accepting sensitive-scope verification. The data model is
  designed so sync arrives as a mirror onto Events we already own. **Also read the ICS
  findings on [A shared calendar that is ours](tickets/016-calendar-section.md)** — a
  no-API `.ics` feed was researched and ruled out on refresh behaviour, and its mechanics
  are recorded there rather than needing re-research.
- **Offline behaviour.** How much works on a phone with no signal. Narrowing as
  neighbouring tickets answer their own share: the SVG globe is offline by construction
  ([ADR-0010](../docs/adr/0010-svg-globe-and-flat-map.md)), and photo upload is already a
  **service worker queue that survives app kill**
  ([ticket 013](tickets/013-photo-import-experience.md)). So a service worker exists —
  which is also what push would need if it is ever picked up
  ([ADR-0015](../docs/adr/0015-news-is-a-derived-feed.md) deferred it). What remains
  untouched: **letters drafted offline** (with an eye to the seal — an unsent draft must
  not sync into a sealed state), and **what the PWA shell caches**. Still too coarse to
  ticket, but closer.

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
