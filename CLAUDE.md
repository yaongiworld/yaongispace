# Yaongispace

The Yaongiworld app — a private web app for Towee (Tae Wook Kang) and Yangcho
(Gee Eun Woo). Mobile-primary, PWA-installable, web works too.

Read the workspace root `../CLAUDE.md` first. Its working principles are binding here,
especially *two users not a million*, *long-lived data*, *privacy by default*, and
*don't over-engineer*.

## Current state (2026-11-01) — read this before "Settled so far"

**The app is built and live** at yaongiworld.com. The site now carries the **couple app**
(PR #2, migration `009_couple_app.sql`), specified by the PO's brief
`yaongiworld app/NEW_ROOM_BRIEF.md` (outside this repo). Where the brief and the
"Settled so far" list below disagree, **the brief wins** — the list is the history of
how we got here, kept for its reasons, and each superseded line says so.

- **Tabs**: five, English labels — **Today · Workout · Era · Moments · Letters**
  (`app/sections.ts`). 사진 · 지도 · 달력 · 기억 are **hidden, not deleted**: code, data
  and URLs stay; deleting `hidden: true` brings one back. The photo share target is off
  with them (`SHARE_PHOTOS` in `app/manifest.ts`). Body text stays Korean, no i18n.
- **Two cats**, not one: **양초** (coral, always left) and **토위** (sky, always right).
  `person.cat` says which is whose; Today asks once ("나는 누구예요?") when it is unknown.
  The UI always says 양초 / 토위, never the Google profile name.
- **Today** replaces the hearth: both cats, today's mood face, leaving-work time (a
  10-minute wheel from 17:30), one cat line (an unseen letter first, then today's News,
  else 조용한 하루), and a small, quiet 오늘 기록하기. No nagging, no red dots.
- **Workout** is the only place workouts are written: cardio = distance + time (wheels,
  0.1km grid, integer metres), strength = weight only, core = reps only, stretch = done.
  Either of us may log for the other (💌) and fix it.
- **Era** is look-only: cardio adds up into South America's five passport trails
  (36.5km a lap, `lib/era/`). Only South America; other eras are not planned.
- **Moments** is a **month grid** (supersedes "agenda, not a grid"): two mood faces per
  day, a dot for a workout, a heart for a memo or anniversary. Anniversaries are the
  existing Events with their yearly repeat.
- **News** gains three kinds — `mood`, `offwork`, `workout_for` — and is still a view.
  No push, no badges.
- **Colour**: Soft Clay unchanged, plus one token, `--color-clay-sky`, only for "this is
  토위's". Still light only.
- **Images**: every picture slot is a 🐱 placeholder with a `data-image-id`
  (`cat-face-yangcho`, `cat-face-tawee`, `item-*`, `trail-*`…) for the image room to fill.
- **PR #1** (`feat/south-america`, the trip planner) stays a draft. The PO has decided the
  day-by-day planner is **not** going into this app; its cardio and distance logic was
  reused. If it is ever merged, its `008` must be renumbered after `009`.
- **Protein counter** (migration `010_protein.sql`): 🥚 on your Today card, one tap = +1
  for today; − / + on a Moments day card fixes a mis-tap. A count only, 0–20, and not
  News.

## Status: charted, then built

This repo started as a plan made with `/wayfinder` — the map lives at
`.wayfinder/map.md` and its tickets in `.wayfinder/tickets/`. The skeleton (tickets
01–08) and then the couple app have since been built; the map is the record of *why*,
the "Current state" above is the record of *what*.

**Read [`CONTEXT.md`](./CONTEXT.md) before writing or discussing anything** — it is the
shared vocabulary (Entry, Place, Visit, Journey, Letter, Note…) and using different
words for these things is how the model rots. Architectural decisions live in
[`docs/adr/`](./docs/adr/).

**Before doing anything here, read the map.** It records what has been decided, what is
still open, and what has been consciously ruled out of scope. Resolve one ticket per
session; take the first unblocked, unclaimed one unless told otherwise.

## Settled so far

- *(Superseded 2026-11-01 — see Current state: five tabs.)*
  **Sections in scope**: home, letters, photos, world map, calendar, knowledge base +
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
  UI chrome. *(2026-11-01: two cats now, 양초 and 토위 — see Current state.)*
  **The hero mascot is being commissioned as an original** — emoji cats are
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
- *(Superseded 2026-11-01 — Moments is a month grid; the agenda is hidden, its Events kept.)*
  **The calendar is an agenda, not a grid**, on a **sixth tab** (home · letters · photos ·
  map · calendar · recall). No month view. Recurrence is a **yearly repeat flag**, not
  RRULE. A Journey **adopts** Events by date range; neither creates the other. **Reminders
  are just News** — there is no second notification system.
- **Events do not sync to the phone's native calendar.** A subscribable `.ics` feed was
  researched and **ruled out**: Google refreshes external ICS on its own ~8–24h schedule
  with no manual refresh, while iOS polls every 5 minutes — so with Yangcho on iPhone and
  Towee on Android the mirror would behave differently for each of us. News is the only
  channel. (This never affected the web app, which is a PWA on both platforms.)
- *(Amended 2026-11-01 — the five tab labels are fixed English words; everything else is still Korean.)*
  **The app speaks Korean.** UI chrome is **Korean, hardcoded — no language switcher**,
  no i18n scaffolding. Dates in Korean convention ("2026년 8월 22일"), relative for the
  recent past ("3일 전"), `Asia/Seoul`. We are **토위** and **양초** in the UI, not our
  legal names.
- **Nothing in the data model records a language.** No `language` column on Entry, Letter,
  Note or Person — mixed and code-switched content is the normal case, and pgroonga handles
  it in one field. **Recall answers in the language of the question but never translates a
  quoted source** — prose may be translated, evidence may not.
- **Generated letter designs must never render text** — decorative only. Generated Hangul
  is garbled, and these are keepsakes.
- *(Superseded 2026-11-01 — Today: two cats and their moods; the spirit — no prompts, a warm nothing on a quiet day — is kept.)*
  **Home is a hearth, not a dashboard** — the hero cat is the content and News is a single
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
