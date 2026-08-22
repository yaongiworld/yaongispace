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

**Before doing anything here, read the map.** It records what has been decided, what is
still open, and what has been consciously ruled out of scope. Resolve one ticket per
session; take the first unblocked, unclaimed one unless told otherwise.

## Settled so far

- **Sections in scope**: home, letters, photos, world map, calendar, knowledge base +
  chat agent.
- **Out of scope this iteration**: SNS/relationships, finance, voice auth.
- **Auth**: Google OAuth is primary. Voice ("Yaongichu!") is a future ritual layer, and
  when built it sits *on top of* real auth — never as the lock.
- **Stack**: Next.js 15 + React 19 + Tailwind 4 + TypeScript + Supabase, on Vercel.
  Matches `../llc/dashboard`; familiarity beats novelty for something meant to last.
- **Theme**: bubbly and fun, cats and zzingni. 3D is confined to the home page for now.
- **Photos are imported, not synced** — Google killed the library-read scopes in 2025.
- **Two OAuth postures**: calendar needs verification to escape 7-day token expiry;
  photos must stay unverified to avoid a $500–$75k/yr CASA assessment.

## Constraint worth remembering

zzingni characters are third-party IP used under private-use-only. **This app cannot
become public, go in an app store, or appear in Yangcho's MBA portfolio** while it uses
them. Swap to original characters first if that ever changes.
