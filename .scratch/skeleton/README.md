# Yaongispace skeleton — implementation tickets

Tracer-bullet slices derived from the `/wayfinder` decision map
(`.wayfinder/map.md`). **These are build slices, not decisions** — every question they
depend on is already answered in a wayfinder ticket or an ADR, both linked inline.

Kept out of `.wayfinder/tickets/` on purpose: mixing decision tickets and build slices in
one numbered sequence would make the wayfinder frontier query meaningless.

## Order

```
01 scaffolding ──┬── 02 sign-in ── 03 schema + Entry + RLS ──┬── 05 letters ── 06 home
                 │                                            ├── 07 calendar
                 └── 04 tab shell ───────────────────────────┴── 08 photo import
```

04 depends only on 01, so the shell can be built in parallel with sign-in and schema.
05, 07 and 08 all need both 03 and 04.

## Seams (agreed before slicing)

- **Entry emission is a database trigger**, not application code — the obligation becomes
  structural, so a section cannot forget, and a rebuild is one re-runnable function. An
  import script writing 15k photos through a different path than the UI is how half a
  library ends up unsearchable.
- **Integration tests run against a real Postgres**, not mocked Supabase. RLS policies,
  pgroonga Korean tokenization and Entry triggers *are* the behaviour, and all three are
  invisible to a mock. Cost: Docker in the loop.
- **R2 and the AI APIs sit behind one narrow interface each**, faked in tests. Genuinely
  external, and unlike RLS their behaviour is not what is under test.

## Not in the skeleton

Recall (needs content to search first), the world map, generated letter designs, AI
suggestions in letters, the Takeout backfill script, and photo browse beyond a grid.

Two things gate later work and only Tony can do them:
[Commission the yaongi](../../.wayfinder/tickets/017-commission-the-yaongi.md) and
[Run the first Takeout export](../../.wayfinder/tickets/018-run-first-takeout-export.md).
