---
id: 010
title: What greets you when you open the app?
label: wayfinder:grilling
status: closed
assignee: session-2026-08-22-l
blocked-by: [006, 014]
closed: 2026-08-22
---

## Question

The home page carries two jobs from the brief: activity notifications (letters, new
destinations, updates) and shortcut navigation to every section.

- What is the home page *for*, emotionally? A dashboard, or a front door? A warm
  "here's what's new with us" beats a status board for an app you open daily.
- Notification model: what generates one, how "read" is tracked, whether they're per
  person (Yangcho should see "Towee wrote you a letter", not her own actions).
- Are notifications ever *pushed* to the phone, or only in-app? Push means service
  workers, permissions, and a whole subsystem — decide if it earns that.
- Navigation: is it home-page shortcuts, a persistent tab bar, or both? Mobile-primary
  argues for a tab bar with home as one destination among several.
- What home shows when nothing has happened — the empty state is the common case for a
  two-person app on a quiet Tuesday, and it should still feel warm.
- Where the 3D moment sits without crowding the content.

**Note**: the notification *model* moved to its own ticket (014) once the Entry index
made it specifiable. This ticket consumes that decision and focuses on the home page as
an experience — what greets you, how you navigate, what the empty state feels like.

Blocked on look-and-feel and the notification model.

## Resolution (2026-08-22)

**Home is a hearth, not a dashboard: the cat is the content and News is the caption.**
Six questions put to the user and accepted. Three of the ticket's original bullets were
already answered upstream and were not re-litigated — the notification model and
push-vs-in-app by
[What counts as news worth telling us about?](014-notification-model.md), and navigation
by [What does bubbly and fun actually look like?](006-look-and-feel.md).

### The page is a hearth

Not a front door, not a dashboard. The hero cat is the page; **News is a single quiet
line beneath it**; the tab bar does the navigating.

This follows from what News actually is. It is a rolling ~30-day window that collapses by
Journey and shows **only the other person's doing** — for two people that is often one
item and frequently zero. A feed-shaped page built on a source that is usually one line
**looks broken on a normal day**. Inverting it — cat as content, news as caption — is the
only arrangement where the quiet case is the design rather than a degraded version of it.

### A quiet Tuesday is warm, never a prompt

Nothing-new shows a **warm nothing** — "조용한 하루" / "a quiet day" — not silence and
**never a prompt**. Silence reads as broken. A prompt ("write Yangcho a letter?") turns
the home page into something that *wants things from you*, which is the same instinct
already rejected as import-nagging in
[How importing photos should feel](013-photo-import-experience.md).

The mood system carries the rest: [ticket 007](007-home-3d-moment.md) already specifies
**pouting when nobody has opened the app in a week**, so quiet stretches are expressive
without the page asking for anything.

### The shortcut grid is dropped

[Ticket 006](006-look-and-feel.md) retained it as "demoted" and explicitly handed this
ticket the call: *"if it proves redundant in use, the home page ticket may drop it."*
**Dropped.** It duplicates the tab bar by design, and it is exactly what would push the
cat below the fold on a phone. The tab bar reaches all five sections in one tap; a grid
beneath it is a second, worse copy competing for the page's one job.

**This exposes a real gap**: Calendar is not in the five-item tab bar
(home · letters · photos · map · recall) and now has no home-page entry either. That is a
question for [A shared calendar that is ours](016-calendar-section.md) — where the
Calendar lives in navigation — not a reason to keep a grid.

### The cat is furniture, not a control

**Upper-centre, above the News line. Tapping it navigates nowhere.** A tap gets a
squash-and-sparkle — [ticket 007](007-home-3d-moment.md)'s existing motion vocabulary — as
pure delight. Giving the app's face a destination makes people hunt for what it does and
be disappointed; it responds, it does not *do*.

### Mood precedence: the cat mirrors the top News item

Moods overlap — a letter waiting at 2am, a week of silence broken by an import — so
precedence needed a rule rather than a matrix. **The mood mirrors the top News item, with
time-of-day as the fallback when there is no news.**

A waiting letter therefore always wins, because it is the most important thing the app can
say. Weary-at-2am appears only on a quiet night. The rule matters beyond tidiness: cat and
caption read from **one source**, so they can never contradict each other.

### A sealed letter is invisible until its date

**No countdown, no hint.** The point of sealing until an anniversary is the surprise, and
a countdown leaks *that* something is coming even when it hides what. Consistent with
[ticket 014](014-notification-model.md), where a sealed letter's news fires on the unseal
date. Seeing what you have sealed belongs in the letters section, **from the writer's side
only**.
