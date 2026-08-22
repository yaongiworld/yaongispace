---
id: 014
title: What counts as news worth telling us about?
label: wayfinder:grilling
status: closed
assignee: session-2026-08-22-k
blocked-by: [003]
closed: 2026-08-22
---

## Question

Graduated from fog once the Entry index existed — notifications are now specifiable,
because "something new happened" has a uniform shape to derive from.

- **Derived or stored?** A notification could be a query over recent Entries not yet
  seen, or its own table of events. Derived is cheaper and self-healing; stored is
  explicit. Note that Entry already carries `occurred_at`, `kind` and `person_id`,
  which is most of what a feed needs.
- **What is newsworthy?** Not every Entry deserves a mention. A new Letter clearly does.
  200 photos imported after a trip is *one* piece of news, not 200 — so some grouping
  rule is needed.
- **Whose news?** Yangcho should see "Towee wrote you a letter", never her own actions
  reflected back. Person on the Entry makes this expressible.
- **Read tracking** for exactly two people — probably a last-seen timestamp per Person
  rather than per-notification read state.
- **Push to the phone, or in-app only?** Push means service workers, permission prompts,
  and a real subsystem. For two people who open the app daily, in-app may be enough —
  decide whether push earns its complexity, and note that a new Letter is the one event
  that might genuinely justify it.
- **Retention** — does news age out, or is the feed also a history?

Feeds the home page ticket, which consumes this.

---

**Added by [ticket 009](009-letters.md) (2026-08-22)**: letters are **editable until
read, then immutable**, so "read" is now a *load-bearing* state in the letters model, not
just a notification concern — opening a letter locks it. Whatever this ticket decides
about tracking read/unread must therefore agree with the letters section rather than
invent its own notion. A letter also **sealed until a future date** must not generate
news until that date arrives.

## Resolution (2026-08-22)

**News is a derived feed with stored read state, ordered by arrival**
([ADR-0015](../../docs/adr/0015-news-is-a-derived-feed.md)). Eight questions put to the
user and accepted without amendment.

### Derived, but not derived all the way down

The feed is a **query over recent Entries**; there is no notifications table. But read
state **is** stored — a **last-seen timestamp per Person** — and that split is the
non-obvious part. `Entry` is itself derived and rebuildable
([ADR-0001](../../docs/adr/0001-entry-index-over-polymorphic-table.md)); if read state
were also derived, a rebuild would **resurrect news you had already dismissed**, making
the repair operation undo your dismissals. Feed derived, marker stored: self-healing
without resurrection.

Dismissal is consequently **all-or-nothing** — one timestamp cannot dismiss one item and
keep another unread. Accepted: per-item state costs the table this rejects, and marking
things individually is a chore for two people.

### News orders by arrival — the one exception to `occurred_at`

`CONTEXT.md` said `occurred_at` is the primary time axis **everywhere**. That word was
false and is now corrected. News sorts by `created_at`, because two cases break
occurred-at ordering: a letter written today *about* last October would sort into
October rather than appearing as news, and a **Takeout backfill** would flood the feed
with four years of 2022 photos. News is about *arrival*.

Recorded in `CONTEXT.md` under **Occurred at** rather than left for an implementation
session to rediscover — an exception nobody wrote down is how the model rots.

### Grouped by Journey, which the previous session made possible

Newsworthiness is not a whitelist. Everything is newsworthy, but **collapses by Journey
where one exists, else by day**. "Towee added 47 photos to *Jeju, October 2025*" is one
piece of news with a name and somewhere to tap — strictly better than "47 photos today",
and only available because [ticket 013](013-photo-import-experience.md) made Journeys the
spine of Photos. **A Letter is never grouped**; it is always singular.

### Always the other person

Filtered by `person_id != me`, **no exceptions**. If you both add photos to one Journey,
you each see only the other's half — which is the interesting half. No "you and Yangcho
added…" composition; that is a feature for a product with groups.

### Two notions of "read", deliberately kept apart

The feed's last-seen timestamp and a Letter's read state are **separate**, and must stay
so. Letters are editable until read, then immutable ([ticket 009](009-letters.md)) — the
seal is load-bearing. **Seeing a letter mentioned in News does not seal it; only opening
the letter does.** Collapsing the two looks like a tidy simplification and would silently
seal letters their writer could still have fixed — a bad, irreversible bug.

A letter **sealed until a date** generates news on its **unseal date**, not its creation
date. A narrow third departure from occurred-at.

### Push is deferred, not discarded

**In-app only this iteration**, with the feed designed so push layers on later without
rework. Two people who open the app daily need no interrupting, and iOS web push requires
the PWA be installed to the home screen and is historically flaky — a notification path
that silently fails for one of you is worse than none. The service worker cost is partly
paid already by the import queue ([ticket 013](013-photo-import-experience.md)).

The strongest future case is the **sealed-until-a-date letter**: nothing else prompts you
to open the app on the right day. That is what will eventually justify push.

### The feed is a window, not a history

A rolling **~30 days**, explicitly not a history. History already lives in the timeline,
the Journey and Recall, all better at it; a feed that grows forever becomes a second,
worse timeline. Since news is derived, ageing out is a `WHERE` clause — nothing is
deleted.

### Unblocks

[What greets you when you open the app?](010-home-and-notifications.md) — its remaining
blocker was this ticket, and it now has a shaped feed to consume.
