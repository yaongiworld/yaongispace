---
id: 008
title: Places we've been and places we want to go
label: wayfinder:grilling
status: closed
assignee: session-2026-08-22-g
blocked-by: [003]
closed: 2026-08-22
---

## Question

The world map holds visited places and wished-for destinations.

- Map technology: Google Maps (as originally suggested) vs. Mapbox vs. MapLibre. Weigh
  cost at 2-user scale, offline behaviour, and how well each does a *beautiful* map —
  this section is as much keepsake as utility, and the default Google styling may
  undercut the bubbly theme.
- Globe or flat map? A 3D globe is the one place 3D does real work, but 3D is scoped to
  home this iteration — decide whether the map earns an exception or waits.
- How a place gets added: manual pin, search-and-pick, derived from photo EXIF, or
  from a calendar event. EXIF is appealing and may fall out of the photos work.
- Visited vs. wished-for as a state on one entity, or two different things.
- What a place holds: photos taken there, letters written about it, dates visited.
  This is the clearest test of whether the shared data model in 003 actually works.

Blocked on the data model.

---

## Resolution (2026-08-22)

Two decisions recorded as
[ADR-0009](../../docs/adr/0009-maplibre-protomaps-and-osm-geocoding.md) and
[ADR-0010](../../docs/adr/0010-svg-globe-and-flat-map.md).

Two of the ticket's five bullets were already answered by the data model and did not
need deciding here: **visited vs. wished-for** is settled by
[ADR-0002](../../docs/adr/0002-place-and-visit-are-separate.md) (a wish is a Place with
no Visit — no status flag), and **what a Place holds** falls out of the Entry index for
free, since every Entry carries `place_id`.

### The section is a portal, biased to record

The map is the only view organised by **place** — the timeline already does time. Its
unique job is therefore to open a pin and get the trip. The wishlist is real but small;
making planning primary would have built a travel-planning app that is not wanted.

### Two views, two renderers

A **d3-geo orthographic SVG globe** for the world view (the record) and **MapLibre +
Protomaps** for the place view (the portal) — see ADR-0010 for why this does not
reopen [ADR-0008](../../docs/adr/0008-css-3d-not-webgl.md), and ADR-0009 for why the
commercial map vendors lost on licensing rather than cost.

At two users **every option surveyed is free**, so the decision turned on two things:
Google and Mapbox both **forbid storing geocoded coordinates permanently**, and both
forbid or restrict offline tile caching. A keepsake meant to last decades cannot rent
the coordinates of its own pins.

### Pin granularity: exact coordinates, clustered on zoom

Store the real coordinate — it aggregates up but never down. Zoom does the work: the
world view shows country and city blobs, zooming in reveals the specific spot. Assumed
usage is mostly cities with the occasional restaurant; the storage decision is unaffected
either way, only the clustering thresholds are.

### Adding a place: search-and-pick as the spine, EXIF as a suggestion queue

Typing "제주" and picking is how a human thinks about a place; tapping a raw coordinate
is not. **Photon** geocodes ([ADR-0009](../../docs/adr/0009-maplibre-protomaps-and-osm-geocoding.md)).

**EXIF proposes, never creates.** Photo GPS survives both import paths per
[ticket 001](001-google-photos-ingest.md), so an import can offer "15 photos here — add
this place?" Silently creating pins would fill the map with the airport, the hotel and
your own apartment. Manual pin remains as a fallback for places with no name.

### The wishlist shares the map

A hope renders as a visibly different pin — hollow against filled — on the same surface
as the memories, with a toggle to hide wishes for a pure record. The emotional payoff of
this section is watching a hope become a memory *in place*, and that only lands if they
share a map. This is the interface expression of ADR-0002: nothing changes state when a
wish is fulfilled, a Visit simply appears.

### Tapping a pin: Visits as the spine

A Place opens as its **Visits**, each expanding to the Entries of that occasion. Three
trips to Jeju are three stories, not one pile — flattening them to a single feed would
discard exactly the structure the data model preserved. At the common case of one Visit
it collapses to the same thing, so the structure costs nothing.

### Facts worth keeping for whoever builds this

- Google's $200 monthly credit **was removed on 2025-03-01**, replaced by per-SKU caps.
- **Nominatim's usage policy explicitly forbids autocomplete** — it is only usable
  behind an explicit submit button. This is why Photon, not Nominatim.
- MapLibre GL JS **v6 is ~138 KB gzipped, roughly half of v5** (the ESM-only rewrite).
- OSM attribution is mandatory on the map surface (ODbL Produced Work).
- Unverified: the exact Protomaps z0–6 world byte count (60–80 MB is derived from the
  ~120 GB z0–15 planet and the per-zoom doubling rule). Run
  `pmtiles extract --maxzoom=6` before committing to an offline basemap. Not on the
  critical path — the globe needs no tiles.
