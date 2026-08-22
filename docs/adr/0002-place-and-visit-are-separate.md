# A Place is a location; a Visit is an occasion at one

The world map holds both places we have been and places we hope to go. The obvious
model — one Place row carrying a "visited" or "planned" status — was rejected because
that flag drifts, and because visiting Jeju three times has no honest representation in
it.

Place and Visit are separate. A Place is a location on the map; a Visit records an
occasion when we were there. **A place we hope to go is simply a Place with no Visit
yet** — there is no status field at all.

## Consequences

Wished-for and visited need no enum, no state machine, and no migration when a hope
becomes a memory: you add a Visit and the pin changes because it now has one. Three
trips to the same place are three Visits against one pin, so the map stays clean while
history stays complete.
