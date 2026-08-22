# A derived Entry index, not a polymorphic table

The chat agent must recall across letters, photos, places, visits, events and notes,
which needs one uniform place to search. We rejected a single polymorphic table holding
all of them — a letter's body and a photo's dimensions do not belong in the same row,
and it would have accumulated nullable columns as sections were added. We also rejected
leaving the six tables entirely independent, which would force the agent to know all
six and require touching it every time a section is added.

Instead each section keeps its own honest table, and every row additionally registers a
lightweight **Entry**: kind, title, searchable text, occurred-at, place, person,
journey, and a pointer back to the source row.

## Consequences

The Entry index is **derived data** — rebuildable from the source tables. It must never
be the only copy of anything, which also means a rebuild is always a safe repair. Every
new section must emit Entries to be recallable; this is the one obligation the shared
model places on section design, and it is cheap to honour up front and expensive to
retrofit.
