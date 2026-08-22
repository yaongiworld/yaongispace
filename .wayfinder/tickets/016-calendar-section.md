---
id: 016
title: A shared calendar that is ours
label: wayfinder:grilling
status: closed
assignee: session-2026-08-22-n
blocked-by: [003, 006]
closed: 2026-08-22
---

## Question

The auth ticket made Events **native to Yaongispace** rather than a mirror of Google
Calendar, so the calendar section needs designing as its own thing. It was previously
assumed to be "whatever Google sync gives us", which is no longer true.

- **What is a shared calendar for two people?** Not a work calendar. Anniversaries,
  trips, appointments worth the other knowing about, things to look forward to. The
  design should follow that, not Google Calendar's shape.
- **Views**: month grid, agenda list, or something warmer. Mobile-first, so the month
  grid may be the wrong default — an agenda of what's coming reads better on a phone.
- **Recurrence**: needed at all? Anniversaries recur yearly and little else does. Full
  RRULE support is a large piece of machinery; a yearly repeat flag may cover reality.
- **Events and Journeys**: a trip is a Journey *and* probably several Events. Decide
  whether creating one from the other is worthwhile or coupling for its own sake.
- **Reminders**: does the app notify before an event, and does that need push? Overlaps
  with the notification model ticket (014) — settle the boundary between them.
- **The absent phone calendar.** Events live here, so they will *not* appear on the
  phone's native calendar. Decide whether that is acceptable or whether an export
  (subscribable `.ics` we publish) closes the gap cheaply without any Google API.

**Note**: Google Calendar sync is deferred, not cancelled — see Not yet specified on the
map. The model is designed so sync later becomes a mirror onto Events we already own,
never a reshaping of them.

---

**Added by [What greets you when you open the app?](010-home-and-notifications.md)
(2026-08-22)**: that ticket **dropped the home-page shortcut grid** as a redundant copy of
the tab bar. The tab bar is five items — home · letters · photos · map · recall
([ticket 006](006-look-and-feel.md)) — which means **Calendar now has no navigation entry
at all**: not in the tab bar, and no longer on the home page.

This ticket must decide where the Calendar lives. Options include a sixth tab (006 chose
five deliberately), folding it into an existing section, or reaching it from the home
page's News line when an Event is imminent. Do **not** solve it by reinstating the
shortcut grid — that was considered and rejected on its own merits.

## Resolution (2026-08-22)

**The calendar is an agenda of what is coming, not a grid — and it gets the sixth tab.**
Six questions put to the user and accepted; a seventh, the subscribable `.ics` feed,
was settled by research rather than preference.

### The sixth tab

The navigation gap opened by [ticket 010](010-home-and-notifications.md) closes with a
**sixth tab**: home · letters · photos · map · **calendar** · recall. The five-item bar in
[ticket 006](006-look-and-feel.md) was the count that fell out of the sections existing at
the time, not a designed limit; six tabs at ~16% width remain comfortable on a phone.

The alternatives all buried a section behind another section's logic. Reaching the
calendar only from the home News line when an Event is imminent is backwards for a thing
you open in order to *plan*; folding it into the world map is coupling for its own sake,
since an anniversary is not travel.

### Agenda only — there is no month grid

**The calendar is a forward-scrolling agenda**, opening at today. No month view is built,
not even as a toggle.

For two people the calendar is nearly empty. A month grid for a couple with four things in
August is twenty-seven empty cells and a great deal of chrome, and "what is coming?" is the
actual question that makes you open the section. Building both means maintaining both, and
the grid is the one that would rot unused. It is addable later — nothing in the data model
resists it.

**The past is reachable by scrolling up.** Events do not vanish when they happen; a past
anniversary is a fact about our life, and it is already in the timeline and Recall through
the Entry index regardless. The section should not pretend otherwise.

### A yearly repeat flag, not RRULE

Recurrence is **one boolean plus a date** — "repeats yearly on this day". No RFC 5545
recurrence machinery: no expansion, no exceptions, no instance-versus-series edits, no DST
reasoning ([ticket 002](002-google-calendar-sync.md) already flagged that complexity when
it was Google's to handle).

Anniversaries and birthdays recur yearly; essentially nothing else in a two-person life
does. If a genuine weekly need ever appears, that is the moment to reconsider — with a
real case to design against rather than a hypothetical.

### Neither Events nor Journeys create each other

**A Journey adopts Events by date range**, exactly as it adopts Photos. Opening
"Jeju, October 2025" shows the Events falling inside its span.

Auto-creating a Journey from a trip Event would make Journeys mandatory in practice and
invert [ADR-0014](../../docs/adr/0014-journey-is-a-named-span-of-life.md), which defines
them as **optional** lenses over the timeline. The adoption mechanism already exists;
no new coupling is introduced. Creating a Journey from an Event stays a one-tap offer,
never automatic.

### Reminders are News, and nothing else

**An imminent Event appears in News.** The calendar has no separate reminder system, no
per-event reminder times, no second notification concept.

News is already the app's single channel — derived, ordered by arrival, rolling ~30 days
([ADR-0015](../../docs/adr/0015-news-is-a-derived-feed.md)) — and an approaching
anniversary is news in precisely that sense. A useful consequence: the cat's mood mirrors
the top News item ([ticket 010](010-home-and-notifications.md)), so it reacts to an
approaching anniversary for free.

Per-event custom reminder times are a work-calendar feature. Skipped.

Since push is deferred, **"reminder" means you will see it when you next open the app.**
That is honest rather than ideal, and it is the second thing — after the sealed-until-a-date
letter — that argues for push whenever it is picked up.

### No native-calendar sync — decided against

**Events live in Yaongispace and nowhere else.** We do not publish a subscribable `.ics`
feed, and Events will not appear in the phones' native calendars.

Research established the feed was *viable* — one route handler, `ical-generator`, no
Google API, no verification ([findings below](#ics-research-kept-for-whoever-revisits)).
It was ruled out on **behaviour**, not cost.

**Refresh is asymmetric and uncontrollable.** iOS Calendar polls as fast as 5 minutes;
Google Calendar refreshes external ICS URLs on its own schedule — reported at ~8–24 hours,
sometimes longer, with **no manual refresh and no setting** at either the subscriber's or
the publisher's end. *Confidence*: the iOS figures are Apple-documented; the Google figure
appears in **no current Google doc**, so the range comes from community reports and vendor
testing. What is consistently corroborated is that no refresh control exists.

**That lands unevenly on us: Yangcho is on iPhone, Towee on Android.** The mirror would be
near-live for one of us and up to a day stale for the other — an event added tonight for
tomorrow might never reach Towee's calendar in time. A feature that behaves differently
for each of us, in a way neither can fix, is worse than not having it: it invites trust it
cannot earn.

**None of this touches the web app.** Yaongispace is a PWA on Chrome and Safari alike, and
both phones read the same Postgres, so the app is never stale. Only the native-calendar
mirror would have been. The platform split was never an app problem.

Consequence: **News is the only channel**, which is exactly what the reminders decision
above already established. There is no second surface to keep in step.

#### ICS research, kept for whoever revisits

Should this be reopened — most likely alongside deferred Google Calendar sync — the
mechanics were established and need not be re-researched:

- Both platforms subscribe to an arbitrary HTTPS `.ics` URL, **read-only** (no write-back
  to reconcile). Google rejects `webcal://`, so `https://` is mandatory; `webcal://` is a
  tap-to-subscribe convenience for iOS only.
- `UID` must derive from the Postgres row id — random per-request UIDs create duplicates
  instead of updating.
- Emit **UTC with a `Z` suffix**, not `TZID` + `VTIMEZONE`: Korea has a fixed +09:00 and
  **no DST since 1988**, and a `TZID` without its `VTIMEZONE` block lands events an hour
  out.
- **Omit `DTEND` on single-day all-day events** — `DTEND` is non-inclusive, the most
  common ICS bug; RFC 5545 defines a DATE-valued `DTSTART` alone as exactly one day.
- The yearly repeat flag maps cleanly to `RRULE:FREQ=YEARLY`, the RFC's canonical
  anniversary pattern — so the Q4 simplification would have cost nothing here.
- **The feed URL is a bearer token**: the endpoint must be anonymously reachable, so auth
  can only live in the URL. Would need ≥128 bits from a CSPRNG, one token per Person,
  hashed at rest, with a rotate path from day one.
- On Vercel, `export const dynamic = 'force-dynamic'`, or a build-time snapshot ships that
  never updates. Use `ical-generator` — lines fold at **75 octets, not characters**, and
  Korean `SUMMARY` text is multi-byte.

Primary sources: [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.txt),
[Apple: iCloud calendar subscriptions](https://support.apple.com/en-us/102301),
[Google Calendar Help 37100](https://support.google.com/calendar/answer/37100).
