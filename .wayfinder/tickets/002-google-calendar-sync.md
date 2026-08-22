---
id: 002
title: How does the calendar stay in sync with Google?
label: wayfinder:research
status: closed
assignee: charting-session
closed: 2026-08-22
blocked-by: []
---

## Question

The calendar section integrates with both users' existing Google Calendars (personal
Gmail accounts, not Workspace; both in KST).

Establish: required OAuth scopes for read vs. read-write and whether they trigger
Google app verification; the incremental `syncToken` mechanism and its 410 GONE
invalidation fallback; push/watch channels (lifetime, renewal, webhook URL
requirements) and whether they work on Vercel serverless; the polling alternative with
quotas for a 2-user app; what bidirectional write involves (recurring events,
timezones, organizer semantics); and whether a dedicated shared Google Calendar beats
aggregating both primary calendars.

**Critical**: verify the refresh-token expiry rule for apps left in testing mode — if
tokens expire on a short clock, an always-on sync is not viable without verification,
and that changes the section's design.

Output is a findings brief with a recommended architecture, flagging anything that
forces Google app verification.

---

## Resolution (2026-08-22)

**Sync is viable, but the same 7-day token trap from the photos ticket applies —
and here it genuinely blocks always-on sync.**

### Scopes and the verification question

Read-only: `calendar.events.readonly` (narrower, preferred) or `calendar.readonly`.
Read-write: `calendar.events`. Avoid full `calendar` — it grants calendar
creation/sharing/deletion we never need.

All Calendar scopes are **sensitive**, not restricted — an important difference from
photos. Sensitive-scope verification means justification, a demo video, branding
review and Search Console domain verification: **3–5 business days, no dollar cost**.
There is no CASA assessment, so unlike photos, verification here is actually
achievable.

**The catch**: staying in Testing mode to avoid verification means **refresh tokens
expire after 7 days**. A background sync simply stops after a week with
`invalid_grant`. Always-on calendar sync therefore *requires* going through
verification. This is the single most consequential finding in the ticket.

### Incremental sync via sync tokens

Full sync first: `events.list` with no `syncToken`, paginate to the last page, keep
`nextSyncToken`. Then incremental: pass the stored token, receive only changed and
deleted (`status: cancelled`) events plus a fresh token. `q`/`timeMin`/`timeMax` cannot
be combined with `syncToken`. Tokens can be invalidated server-side (inactivity, ACL
changes) → **410 GONE**; the correct response is to discard token and cache, redo a
full sync, store the new token.

### Push vs. polling — poll

Push (`events.watch`) delivers **headers only, no body**, so we would still call
`events.list` to learn what changed. Channels expire (~1 month) and need a renewal cron.
Workable on Vercel but adds a whole subsystem for no gain at this scale.

Polling wins easily: `events.list` with the stored `syncToken` on a Vercel Cron every
few minutes. Quota is 600 req/min per user and 10,000 req/min per project — two people
polling every few minutes uses a rounding error of it.

### Writes

`events.insert`/`update`/`patch` with `calendar.events`. Always send explicit
`start.timeZone`/`end.timeZone` as `Asia/Seoul` rather than bare UTC offsets — Calendar
stores the IANA zone and needs it for correct recurrence expansion and DST. Recurring
events: instances carry `recurringEventId`; edit the instance, not the series master,
and cancel an occurrence with `status: "cancelled"` rather than deleting it.

### Shared calendar pattern — one dedicated calendar

Create **one shared Google Calendar** both accounts join with edit rights, and sync only
that. Single source of truth, one `syncToken`, native recurrence and ownership
semantics. Aggregating both primary calendars app-side means two OAuth connections,
dedup logic, and an ambiguous answer to "where do writes go" — meaningfully more code
for no benefit to two people.

### Recommended architecture

1. One dedicated shared Google Calendar; both Gmail accounts join with edit rights.
2. Build in Testing mode, accepting weekly re-auth during development.
3. **Before relying on background sync, submit for sensitive-scope verification on
   `calendar.events` alone and move to Production.** Budget 3–5 days plus domain
   verification for the Vercel domain. This step is unavoidable.
4. Vercel Cron polling `events.list` with the stored `syncToken`; full resync on 410.
5. Writes via `events.insert`/`patch`, always explicitly `Asia/Seoul`.

### Consequences for the map

- **Verification is now a real, schedulable task**, not a decision — it gates working
  calendar sync and takes days of calendar time. It needs its own ticket.
- Worth noting the asymmetry: calendar verification is cheap and achievable; photos
  verification (restricted + CASA, $500–$75k/yr) is not. So calendar goes to
  Production and photos stays in Testing forever, which means **two different OAuth
  postures in one app** — a direct input to the auth ticket.
