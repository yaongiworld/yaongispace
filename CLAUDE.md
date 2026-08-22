# Yaongispace

The Yaongiworld app — a private web app for Towee (Tae Wook Kang) and Yangcho
(Gee Eun Woo). Mobile-primary, PWA-installable, web works too.

Read the workspace root `../CLAUDE.md` first. Its working principles are binding here,
especially *two users not a million*, *long-lived data*, *privacy by default*, and
*don't over-engineer*.

## Status: being charted, not built

This repo currently holds **no application code by design**. It is being planned with
`/wayfinder` — the map lives at `.wayfinder/map.md` and its tickets in
`.wayfinder/tickets/`.

**Read [`CONTEXT.md`](./CONTEXT.md) before writing or discussing anything** — it is the
shared vocabulary (Entry, Place, Visit, Journey, Letter, Note…) and using different
words for these things is how the model rots. Architectural decisions live in
[`docs/adr/`](./docs/adr/).

**Before doing anything here, read the map.** It records what has been decided, what is
still open, and what has been consciously ruled out of scope. Resolve one ticket per
session; take the first unblocked, unclaimed one unless told otherwise.

## Settled so far

- **Sections in scope**: home, letters, photos, world map, calendar, knowledge base +
  chat agent.
- **Out of scope this iteration**: SNS/relationships, finance, voice auth, the Google
  Photos API, Google Calendar sync.
- **Auth**: Google OAuth is primary. Voice ("Yaongichu!") is a future ritual layer, and
  when built it sits *on top of* real auth — never as the lock.
- **Stack**: Next.js 15 + React 19 + Tailwind 4 + TypeScript + Supabase, on Vercel.
  Matches `../llc/dashboard`; familiarity beats novelty for something meant to last.
- **Theme**: **Soft Clay** — warm peach→pink→lilac gradient, puffy white cards, warm
  brown ink. **Light only, no dark mode** (set `color-scheme: light`). 3D is confined to
  the home page for now.
- **Assets**: Fluent Emoji 3D (MIT) / Noto (Apache-2.0) for icons; Phosphor or Iconoir for
  UI chrome. **The hero mascot is being commissioned as an original** — emoji cats are
  glyphs, not mascots. It has moods, swapping by app state. One cat, one place, reacting.
- **Motion**: CSS 3D transforms, not WebGL — measured, and real 3D was invisible at 132px
  for ~600KB and a warmer battery.
- **Fonts**: Pretendard **self-hosted via `next/font/local`** — `next/font/google`
  silently drops CJK subsets and fails quietly. BM Jua + Fredoka for display.
- **Photos are imported, not synced** — Google killed the library-read scopes in 2025.
  They arrive by PWA share target and scheduled Takeout. **The Photos API is not used.**
- **The photo library is curated, not complete.** Google Photos stays the archive of
  record (139GB raw); Yaongispace holds only the subset worth looking at. The Google
  Photos **albums** are the curation seam — four years of hand-picking already done, and
  Takeout preserves album folders plus `.json` sidecars. Never call this a backup or a
  mirror.
- **Photo bytes live on Cloudflare R2**, not Supabase Storage — Supabase's egress quota is
  shared with the database (the archive could break login) and hosted Supabase cannot use
  your own bucket. Supabase keeps Postgres and auth. Signed expiring URLs; bytes never
  transit Vercel; renditions made once at import with `sharp`.
- **Original photo bytes are never rewritten.** Edits become a Rendition or a stored
  correction; deletes tombstone. The app cannot damage a photo — every operation is
  additive.
- **The exit is a standing scheduled export**, in two layers: human-readable (dated
  folders, Markdown letters, GeoJSON places) and lossless (`pg_dump` + originals). It must
  carry **the selection**, which is the part no other backup holds.
- **Google is sign-in only** (`email`/`profile`). No sensitive or restricted scopes
  anywhere, so no verification, no CASA, no 7-day token expiry. Google Calendar sync is
  deferred; Events are native to Yaongispace.
- **Identity is a Person**, not a Google account — a Google account is a credential
  attached to a Person. Losing it must never mean losing data.
- **Journeys are the spine of the Photos section**, and a **Journey is a named span of
  our life** — not only travel ([ADR-0014](docs/adr/0014-journey-is-a-named-span-of-life.md)).
  A Google Photos **album is a Takeout-boundary word, never an app concept**: an album
  folder becomes a Journey on import, automatically, editable after. The **timeline is the
  substrate; Journeys are lenses over it** — a Photo in no Journey is still first-class.
- **Importing is review-then-queue.** The share target shows a grid to deselect from
  before anything is stored, then uploads in the background (service worker queue). Never
  blocked by a Journey picker. EXIF: `occurred_at`, GPS and dimensions as columns, full
  blob as JSON. Exact duplicates (SHA-256) are a silent no-op; near-duplicate review is
  deliberately **not** built yet. Takeout backfill is a local CLI script, not a feature.
  No import nagging.
- **Domain model**: entities are Person, Letter, Photo, Place, Visit, Journey, Event,
  Note, unified by a derived **Entry** index that makes recall possible. `occurred_at`
  (when it happened) is the primary time axis, not `created_at`. A wished-for
  destination is a Place with no Visit — there is no status flag.
- **The calendar is an agenda, not a grid**, on a **sixth tab** (home · letters · photos ·
  map · calendar · recall). No month view. Recurrence is a **yearly repeat flag**, not
  RRULE. A Journey **adopts** Events by date range; neither creates the other. **Reminders
  are just News** — there is no second notification system.
- **Events do not sync to the phone's native calendar.** A subscribable `.ics` feed was
  researched and **ruled out**: Google refreshes external ICS on its own ~8–24h schedule
  with no manual refresh, while iOS polls every 5 minutes — so with Yangcho on iPhone and
  Towee on Android the mirror would behave differently for each of us. News is the only
  channel. (This never affected the web app, which is a PWA on both platforms.)
- **The app speaks Korean.** UI chrome is **Korean, hardcoded — no language switcher**,
  no i18n scaffolding. Dates in Korean convention ("2026년 8월 22일"), relative for the
  recent past ("3일 전"), `Asia/Seoul`. We are **토위** and **양초** in the UI, not our
  legal names.
- **Nothing in the data model records a language.** No `language` column on Entry, Letter,
  Note or Person — mixed and code-switched content is the normal case, and pgroonga handles
  it in one field. **Recall answers in the language of the question but never translates a
  quoted source** — prose may be translated, evidence may not.
- **Generated letter designs must never render text** — decorative only. Generated Hangul
  is garbled, and these are keepsakes.
- **Home is a hearth, not a dashboard** — the hero cat is the content and News is a single
  quiet line beneath it; the tab bar navigates. A quiet day shows a **warm nothing**
  ("조용한 하루"), never silence and **never a prompt**. **The home shortcut grid is
  dropped** — it duplicated the tab bar. The cat navigates nowhere (tap = squash-and-
  sparkle only), its **mood mirrors the top News item** with time-of-day as fallback, and
  a **sealed letter is invisible until its date** (no countdown — it would leak the
  surprise).
- **News is a derived feed**, not a notifications table — a query over recent Entries,
  with only a **last-seen timestamp per Person** stored (deriving read state too would let
  a rebuild resurrect dismissed news). **News is the one exception to `occurred_at`**: it
  orders by `created_at` ([ADR-0015](docs/adr/0015-news-is-a-derived-feed.md)). Collapses
  by Journey, else by day; Letters never group. Always the other person's doing. A rolling
  ~30 days, not a history.
- **Seeing a Letter in News does not seal it** — only opening the Letter does. Feed-read
  and letter-read are two separate notions and must stay separate.
- **Push notifications are deferred**, in-app only for this iteration; the feed is shaped
  so push can be added later. A sealed-until-a-date letter is the case that will justify it.
- **Recall** (the chat agent) is a search box that speaks — it surfaces your own Entries
  and always shows its sources, preferring to under-claim. Never writes Letters.
- **Search must be Korean-aware**: Postgres cannot tokenize Korean, so we use pgroonga
  (not `tsvector`) fused with pgvector via RRF. `to_tsvector` on Korean silently fails.
- **Commercial AI APIs**, chosen deliberately over self-hosting — a conscious trade
  against *privacy by default*, with a cheap exit if it stops feeling right.

## No third-party character IP

The mascot is being commissioned as an original, and all interim assets are MIT
(Fluent) or Apache-2.0 (Noto). The earlier zzingni private-use-only restriction has
therefore been retired — **this app may be made public, listed, or shown in Yangcho's
MBA portfolio** once the commissioned yaongi lands. Keep it that way: do not introduce
character art whose licence would re-impose that limit.
