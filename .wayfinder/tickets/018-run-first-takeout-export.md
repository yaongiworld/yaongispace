---
id: 018
title: Run the first Takeout export and count what landed
label: wayfinder:task
status: open
assignee:
blocked-by: []
---

## Question

Nothing to decide — this is manual work that a decision waits on. **HITL: only Tony can
do it**, since it runs against his Google account and lands on his laptop.

[How importing photos should feel](013-photo-import-experience.md) resolved every part of
the import flow except the **review pass** — how the kept subset gets browsed and how
near-identical shots collapse — because that design changes shape across the range the
library might be. A sub-agent confirmed the library has **never been measured**: no export
exists on this machine, and the 15k–60k estimate is inferred from a 139GB figure whose own
derivation is unrecorded.

Ticket 013's own note: *"Worth measuring from the first export before designing the flow."*

### The checklist

1. Configure a Google Takeout export for **Google Photos only** (not the whole account) at
   `takeout.google.com`. Enable the **scheduled/incremental** option added 2026-06 so
   follow-ups arrive automatically every ~2 months.
2. Wait for delivery (days, not minutes). Download the zips.
3. Record and report back:
   - **Total item count** (photos and videos separately, if easy).
   - **Total size on disk** once unzipped — and whether it matches 139GB.
   - **Where 139GB originally came from.** If it was total Google One usage it includes
     Drive and Gmail, and the real photo library is smaller. It is cited in five files as
     a bare fact; give it a source or correct it.
   - **Number of album folders**, and a rough sense of their size distribution — a handful
     of big ones, or a long tail of small ones?
   - **How many albums are trips** versus other named spans. This directly sizes the
     Journey model that [ADR-0014](../../docs/adr/0014-journey-is-a-named-span-of-life.md)
     just widened for.
   - Whether the `.json` sidecars carry real dates and GPS as expected, on a spot check of
     a few files.

### What unblocks when this closes

The **review-pass and browse design** graduates from fog into its own ticket. Near
15k the first pass is an evening; near 60k it must be chunked by year or by Journey or it
will never get done — and that is a different design, not the same one scaled.

Do **not** import anything into the app as part of this ticket. The backfill script is
plumbing described in ticket 013, and the app does not exist yet. This is a measurement.
