# News is a derived feed with stored read state, ordered by arrival

**News** — what greets you on the home page — is a **query over recent Entries**, not a
notifications table. Nothing about a piece of news is stored. The one thing that *is*
stored is a **last-seen timestamp per Person**, which is what makes the feed shrink when
you look at it.

News is ordered by **when a thing arrived** (`created_at`), which is the only place in
Yaongispace that does not reason in `occurred_at`.

## Why this is worth an ADR

Three separate traps, each of which looks like the obvious implementation.

**A notifications table is the reflex, and it is wrong here.** Every app has one, so a
future reader will assume its absence is an oversight. For two people who open the app
daily, a stored table buys explicitness and costs a subsystem: rows to write on every
mutation, a backfill whenever a section is added, and a second source of truth that can
disagree with the Entries it describes. The feed is cheap to recompute and self-healing.

**But "derive everything" is also wrong**, and this is the subtler half. `Entry` is
itself derived data, rebuildable from the source tables ([ADR-0001](0001-entry-index-over-polymorphic-table.md)).
If read state were *also* derived, a rebuild would resurrect news you had already
dismissed — the repair operation would undo your dismissals. So the split is deliberate:
**the feed is derived, the seen marker is stored**. Only the marker needs durability, and
storing it is one column.

**Ordering by `occurred_at` would be wrong, and `CONTEXT.md` says `occurred_at` is the
primary time axis *everywhere*.** That word is now false, and this ADR is where the
exception is recorded. Two cases force it: a letter written today *about* last October
carries `occurred_at` in October and would sort into the past instead of appearing as
news; and a Takeout backfill imports four years of photos whose `occurred_at` spans four
years, which under occurred-at ordering would bury the feed in 2022. News is about
*arrival*, so it sorts by arrival.

A sealed letter is a narrow third case: its news fires on its **unseal date**, not its
creation date, so a letter sealed for ten years generates news in ten years.

## What it costs

The feed query is not free — it reads Entries and filters by a stored timestamp on every
home-page load. At two users and a rolling window this is trivially small, but it is real
work done repeatedly rather than once at write time. If the feed ever became expensive,
the fix is a materialised view, not a notifications table.

Dismissal is also **all-or-nothing**: a single last-seen timestamp means you cannot
dismiss one item and keep another unread. Per-item read state would allow that, at the
cost of the stored table this ADR rejects. For two people this is an acceptable trade —
and the alternative, marking things individually, is a chore.

## What this does not change

**Reading News is not reading a Letter.** Letters are editable until read, then immutable
([ticket 009](../../.wayfinder/tickets/009-letters.md)) — the seal is load-bearing. Seeing
a letter *mentioned* in the feed must never lock it; only opening the letter does. These
are two separate notions of "read" and collapsing them would look like a tidy
simplification while silently sealing letters their writer could still have fixed.

**Push notifications are deferred, not rejected.** In-app only for this iteration. The
feed is designed so push can be layered on later without rework, and a sealed-until-a-date
letter is the case that will eventually justify it — nothing else prompts you to open the
app on the right day.
