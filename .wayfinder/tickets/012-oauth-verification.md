---
id: 012
title: Get Google to trust us (sensitive-scope verification)
label: wayfinder:task
status: closed
assignee: session-2026-08-22-d
closed: 2026-08-22
blocked-by: [005]
---

## Question

Surfaced by the calendar research. Nothing to decide here — this is work that must
happen before calendar sync can run for more than 7 days, and it takes real calendar
time, so it's tracked rather than discovered late.

Google sensitive-scope verification for `calendar.events`, to move the app from Testing
to Production and escape the 7-day refresh-token expiry.

Checklist:
- Google Cloud project and OAuth consent screen configured for production.
- Written justification for `calendar.events` (request only this scope — adding photos
  scopes drags the app into the *restricted* tier and its CASA assessment, which costs
  $500–$75,000/yr and must be avoided).
- Demo video of the OAuth flow.
- Branding review assets (app name, logo, homepage, privacy policy URL).
- Domain ownership verified in Search Console for the deployed domain.

Budget 3–5 business days of review. Verify current requirements at submission time —
they move.

**Resolution should record**: the Cloud project id, where credentials live, the
verified domain, and the outcome. Later tickets depend on these facts.

Blocked on auth, which decides the OAuth topology this is submitted against.

---

## Closed as out of scope (2026-08-22)

**Not resolved — no longer needed.** This ticket existed to escape the 7-day
refresh-token expiry on `calendar.events`, a *sensitive* scope.

The auth ticket removed the requirement entirely: the Photos API is dropped, Google
Calendar sync is deferred to a later iteration, and Google is used for **sign-in only**
via the non-sensitive `email`/`profile` scopes. Non-sensitive scopes need no
verification and their tokens do not expire.

Nothing in this iteration requires Google to review the app.

If Google Calendar sync is picked up later, verification comes back with it — and this
checklist is still accurate, so revive it then rather than rewriting it. Confirm current
requirements at that point; Google moves them.
