# 03 — The schema, the Entry index, and RLS

**What to build:** The shared data model, with the **Entry** index emitted automatically
and Postgres RLS on every table. After this, any section can store its own things and be
recallable for free.

Kept as one ticket deliberately: schema, triggers and RLS split into three would be
horizontal slices, none independently verifiable — you cannot demo "the schema".

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Tables for **Person, Letter, Photo, Place, Visit, Journey, Event, Note** using the
      `CONTEXT.md` vocabulary exactly — no `user`, no `album`, no `moment`
- [ ] **`occurred_at` is the primary time axis** on everything that has one, distinct from
      `created_at`
- [ ] **A Place with no Visit is a wish** — no status flag, no `is_wished` column
      ([ADR-0002](../../../docs/adr/0002-place-and-visit-are-separate.md))
- [ ] **A Journey is a named span of our life, not only travel** — no travel-only
      constraint ([ADR-0014](../../../docs/adr/0014-journey-is-a-named-span-of-life.md))
- [ ] **No `language` column anywhere** — mixed and code-switched content is the normal case
- [ ] **Entry is emitted by database trigger**, one per source table, so a section
      physically cannot forget to emit
      ([ADR-0001](../../../docs/adr/0001-entry-index-over-polymorphic-table.md))
- [ ] A **rebuild function** regenerates the whole Entry index from source tables, and a
      test proves the rebuild is **lossless** — this is the safe-repair property
- [ ] **pgroonga** indexes Entry text, not `tsvector`: a test proves searching `제주`
      matches `제주도에서`, which `to_tsvector` silently fails
      ([ADR-0003](../../../docs/adr/0003-pgroonga-for-korean-search.md))
- [ ] pgvector column exists; **no vector index yet** (unwarranted below ~100k rows)
- [ ] **RLS on every table**, keyed to the signed-in Person. The allowlist is the door;
      RLS is the wall
- [ ] Integration tests run against real Postgres and **assert RLS actually denies** —
      not that the app avoids asking
