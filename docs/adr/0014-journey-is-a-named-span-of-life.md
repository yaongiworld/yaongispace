# Journey is a named span of our life, not only of travel

A **Journey** gathers the Photos, Visits, Events and Letters belonging to a named stretch
of time. It was originally defined as a span of *travel* — a trip. It is now widened:
travel is the commonest kind of Journey, not the definition of one. A wedding, a move, a
season with the cats, "the year we got married" — all are Journeys.

This supersedes the travel-only definition recorded in
[`CONTEXT.md`](../../CONTEXT.md) at the time of
[the shared data model ticket](../../.wayfinder/tickets/003-shared-data-model.md).

## Why this is worth an ADR

Because it was decided once already, the other way, and a future reader will find the
looser definition and assume it was sloppiness rather than a revision.

The travel-only definition was correct for the section that produced it. The world map
needed a noun for "a trip, seen years later as one thing", and Journey was drawn to fit
that hole. Nothing in the mechanism was ever travel-specific — Journey gathers Entries
over a time span, and a span of time does not care whether you left the country.

What forced the widening was the **photo import flow**. Four years of Google Photos
albums are the curation seam this app is built on, and they are not all trips. Under the
travel-only definition, those albums had nowhere to land: either a second grouping noun
appears beside Journey — the exact vocabulary rot `CONTEXT.md` exists to prevent — or the
non-trip albums dissolve into an undifferentiated timeline, making the best-curated parts
of the library second-class. Widening one word was cheaper and truer than either.

## What it costs

The word is now less precise. "Journey" carries a travel connotation in both English and
Korean, and a Journey named "이사" (moving house) reads slightly oddly. We accept the
mild strangeness in exchange for one noun instead of two.

It also puts light pressure on **Visit**, whose `_Avoid_` line says "Trip (that is a
Journey)". That still holds — a Visit is being at a Place, a Journey is a named span —
but the two are no longer distinguished by "one is travel". They are distinguished by
Place versus time, which was always the real seam.

## What it does not change

Journey remains **optional**. The timeline is the substrate; Journeys are lenses over it.
A Photo belonging to no Journey is a normal, first-class Photo, not an orphan.
