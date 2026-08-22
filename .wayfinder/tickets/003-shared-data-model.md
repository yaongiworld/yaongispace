---
id: 003
title: The shared data model — what is a memory, a place, a letter?
label: wayfinder:grilling
status: closed
assignee: session-2026-08-22-b
closed: 2026-08-22
blocked-by: []
---

## Question

Everything else hangs off this, which is why it's first. Settle the core domain
entities and their relationships: letters, photos, places (visited and wished-for),
calendar events, notes, and whatever ties them together.

The load-bearing constraint: the chat agent reads *across* all sections (Q7 settled as
"retrieval over the whole app"). That only works if every section emits its content in
a retrievable, uniformly-addressable form from day one — cheap now, expensive to
retrofit. So this ticket must decide the common shape that makes cross-section
retrieval possible, not just six independent schemas.

Specifically resolve:
- Core entities, their fields, and their relationships.
- Whether there is a unifying concept (a "moment"? an "entry"?) that letters, photos,
  places, and events are all specialisations of — or whether forcing that is
  over-engineering.
- How time and place attach to things, given a trip generates photos, places, calendar
  entries, and probably a letter.
- Ownership: settled as **fully shared**, with letters carrying sender/recipient. No
  permissions system. Confirm nothing in the model needs to break that.
- What each section must emit for the chat agent to retrieve it.

Use `/domain-modeling` and record the ubiquitous language — this vocabulary should
outlive the map.

---

## Resolution (2026-08-22)

Vocabulary recorded in [`CONTEXT.md`](../../CONTEXT.md); two decisions recorded as
[ADR-0001](../../docs/adr/0001-entry-index-over-polymorphic-table.md) and
[ADR-0002](../../docs/adr/0002-place-and-visit-are-separate.md).

### The entities

**Person**, **Letter**, **Photo**, **Place**, **Visit**, **Journey**, **Event**,
**Note** — plus **Entry**, the shared index that makes recall possible.

### The unifying shape: a derived Entry index

Rejected a polymorphic table (nullable-column sprawl; a letter's body and a photo's
dimensions do not belong in one row) and rejected six wholly independent tables (the
agent would need to know all six, and adding a seventh section would mean touching it).

Each section keeps its own honest table. Every row *also* registers an **Entry**
carrying only what recall needs:

| field | meaning |
| --- | --- |
| `kind` | letter, photo, place, visit, event, note |
| `title` | short human label |
| `body` | searchable text — letter text, photo caption, note content |
| `occurred_at` | when it happened |
| `place_id` | where, if anywhere |
| `person_id` | whose, if anyone's |
| `journey_id` | which trip, if any |
| `source_table` + `source_id` | pointer back to the real row |

The Entry index is **derived** — rebuildable from source tables, never the only copy of
anything. A rebuild is therefore always a safe repair.

### `occurred_at` is the primary time axis

A letter written today about Jeju last October *happened* in October. Every section
distinguishes when a thing happened from when it was created; `created_at` exists only
for auditing. Timeline, map, and recall all reason in `occurred_at`. Photos get theirs
from EXIF, which survives both direct upload and Takeout sidecars per ticket 001.

### Place vs. Visit — and no status flag

A Place is a location; a Visit is an occasion at one. **A wished-for destination is a
Place with no Visit yet.** No `status` enum, no planned/visited flag to drift, no
migration when a hope becomes a memory. Three trips to Jeju are three Visits on one pin.

### Journey — travel only, deliberately not generalised

A trip is a real thing in memory but four kinds of row in a database, so **Journey**
exists to gather them and be opened as one thing in ten years. Scoped to travel only.
Generalising to a `Collection` ("our wedding", "2025") was rejected as generalising
before a second case exists. If a non-travel grouping is wanted later, that is the
evidence — collect it first.

### Person — thin, and a clean seam to future SNS

Exactly two rows. An identity a Letter is addressed to or a Photo is about, and nothing
more: no contact details, no last-contacted, no relationship graph. This is *not* SNS
smuggled back in — it is the seam that lets the out-of-scope SNS map attach later
without reshaping letters and photos.

### Ownership confirmed fully shared

Nothing in the model needs a permissions system. Letters carry sender and recipient,
which is about addressing, not access — both people can read every letter. No roles, no
row-level ownership beyond that.

### Vocabulary warning carried into CONTEXT.md

The unifying concept is **Entry**, deliberately *not* "moment" — `moment` already means
a trending US lifestyle event in the sibling LLC project. Two meanings across two
projects the same two people work in would rot the shared vocabulary.

### What each section must emit

Every section emits Entries. This is the one obligation the shared model places on
section design, and the reason it was settled first: cheap now, expensive to retrofit.
