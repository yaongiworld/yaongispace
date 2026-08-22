---
id: 005
title: Google sign-in for exactly two people
label: wayfinder:grilling
status: closed
assignee: session-2026-08-22-d
closed: 2026-08-22
blocked-by: []
---

## Question

Google OAuth is primary auth (settled). Voice is deferred entirely. What's left is
smaller but genuinely fiddly:

- Supabase Auth with the Google provider vs. rolling it directly — and how it
  interacts with the Google API scopes that photos and calendar need. Are these one
  OAuth grant or several?
- The allowlist: exactly two accounts may enter. How is that enforced, and what does a
  third person see?
- Session lifetime on a phone. This is the ritual-adjacent decision — the app should
  essentially never log you out, since re-authing to look at your own photos is
  friction with no security benefit for a 2-person private app.
- Where Google refresh tokens live, given both photos and calendar need long-lived
  API access. This may collide with findings from the research tickets, especially
  the testing-mode token expiry question.
- What happens if a Google account is lost — the *long-lived data* principle says
  losing an account must not mean losing decades of photos.

Leave a clean seam for voice to be added later as a ritual layer, without designing it.

---

## Resolution (2026-08-22)

### The collision this ticket had to break

The two research tickets, read together, produced a contradiction neither saw alone:
calendar needed a **verified/Production** project to escape the 7-day refresh-token
expiry, while photos had to stay **unverified/Testing** forever to avoid a CASA
assessment ($500–$75k/yr).

An OAuth consent screen has **one publishing status per Google Cloud project**. Two
postures therefore meant two Cloud projects, two OAuth clients, two consent screens and
two token sets — permanent structural complexity.

Both halves were resolved by removing the requirement rather than paying for it.

### Google is used for sign-in only

**Scopes: `email` and `profile`. Nothing else.** These are *non-sensitive*: no
verification, no demo video, no branding review, no Search Console step, and **no token
expiry**. The Cloud project is created once and forgotten.

**The Photos API is dropped entirely** (decided with the user). Automatic sync was never
available — Google removed the library-read scopes on 2025-03-31, and the Picker API
requires a human tapping a Google-hosted UI each time with URLs that die in 60 minutes.
Keeping the Picker would have cost a second Cloud project and weekly re-consent to buy
an occasional convenience. Photos arrive by **PWA share target** (two taps from the
phone) and **scheduled Takeout** (set up once, runs itself) — neither touches a Google
API. See ticket 013.

**Google Calendar sync is deferred** (decided with the user). `calendar.events` is a
*sensitive* scope, and it alone would force verification. Events are **native to
Yaongispace** this iteration — our own rows, joining Journeys and Recall like everything
else. Google sync becomes its own later ticket, and the data model does not change when
it arrives: sync becomes a mirror onto Events we already own. The verification cost is
identical whenever it is paid, and by then we will know whether it is wanted.

**Consequence: the app has no sensitive or restricted scopes at all.** No verification,
no CASA, no 7-day fuse, one consent screen. This is the simplification that makes the
whole auth story boring, which is what it should be.

### Sign-in and API access are kept separate

Supabase Auth's Google provider handles **sign-in only**. It is not used as a store for
third-party API tokens — Supabase does not durably manage or refresh them, and a cron
job at 3am with no user present needs a token that is definitely valid.

Since no Google API is called this iteration, no `google_credentials` table is needed
*yet*. **The seam is named deliberately**: when Google Calendar sync arrives, API
credentials get their own table that we own and refresh ourselves, rather than being
read out of the auth session. Conflating identity with API access is a classic source of
"sync mysteriously stopped" bugs.

### Exactly two people: allowlist plus RLS

Two layers, on purpose:

1. **Allowlist** — permitted Google account emails, checked server-side at sign-in.
   Stored as **data, not a hardcoded constant**, so adding a third account (a shared
   tablet, a family member) is a row rather than a redeploy. A non-allowlisted account
   completing Google sign-in gets a polite "this is a private world" page and no session.
2. **Postgres RLS** keyed to the signed-in Person, on every table.

The allowlist is the door; RLS is the wall. This is the one place where a single failed
check leaks the entire archive, so a second layer is warranted rather than
over-engineering.

### Identity is a Person, not a Google account

**Data ownership is never keyed to a Google account id.** Data belongs to a **Person**
(already our own entity in `CONTEXT.md`); a Google account is a *credential attached to*
a Person, and more than one credential can attach.

This is what satisfies *long-lived data*: if Yangcho loses her Google account, she has
lost a credential, not half a shared archive. It also makes a break-glass sign-in (email
magic link) a later addition rather than a migration.

### Sessions effectively never expire

Long-lived refresh with silent renewal; the PWA opens straight onto the home screen on a
trusted device. There is no meaningful security gain from expiring sessions for a
two-person private app on personal phones — **the phone's own lock screen is the real
boundary** — and re-authing to look at your own photos is pure friction.

### The seam left for the voice ritual

Because sessions do not really expire, "Yaongichu!" has an obvious future home: a
greeting played on app open, decorating a session that never lapsed. It gates nothing.
Recorded as a seam only — not designed here, per the out-of-scope ruling.
