# The map stack is MapLibre + Protomaps, and geocoding is Photon

Google Maps was the original suggestion, and at two users every option surveyed —
Google, Mapbox, MapLibre with any tile provider — is **free**. Cost decides nothing
here, so a future reader will wonder why the obvious default was not taken. It lost on
licensing, and the licensing bites precisely where this app is most opinionated:
*long-lived data* and *avoid lock-in*.

## The deciding fact: who owns the coordinates you looked up

Pinning a place geocodes it once and keeps that coordinate for decades. That is the
whole usage pattern of this section.

| | Store coordinates permanently? |
| --- | --- |
| Google Places | No — and results must be displayed on a Google map |
| Mapbox Search | No — "temporary use only" without a sales contract |
| **Photon (OSM)** | **Yes, no restriction** |
| Nominatim (OSM) | Yes, but **autocomplete is explicitly forbidden** by its usage policy |

Both commercial options forbid keeping the one thing a keepsake needs to keep. Photon
is purpose-built for OSM autocomplete, carries no display restriction, and Komoot's
public instance is ample at a few hundred lookups ever.

## Tiles and rendering

**MapLibre GL JS v6** (BSD-3-Clause, 138 KB gzipped — roughly half of v5) with
**Protomaps** basemap tiles self-hosted as a single `.pmtiles` file on Supabase
Storage. No API key, no rate limit, no vendor account.

The style is a plain MapLibre Style Spec **JSON document living in the repo**, which is
what actually wins it: Soft Clay needs a map deliberately stripped of detail and tinted
peach and lilac, and here every layer colour is a token to edit and every unwanted layer
is a line to delete. Google's cloud-based styling is the weakest of the field — a
constrained feature set with no true low-detail vector control. Mapbox Studio is the
most polished editor but locks the style to Mapbox hosting.

Protomaps' `light`/`white` themes are the starting point; Stamen Watercolor and CARTO
Positron are worth stealing palette ideas from.

Protomaps tiles are OpenStreetMap **ODbL Produced Works**: attribution is mandatory,
and caching, self-hosting and offline use are all explicitly permitted. Google prohibits
caching tiles outright and Mapbox permits it only through its own native SDKs, so
MapLibre + Protomaps is the *only* surveyed path where an offline PWA is legal at all.

## Consequences

One vendor relationship fewer: no Google Cloud project for maps, no Mapbox account, no
key to rotate or bill to watch. The basemap is a file we hold.

OSM attribution must appear on the map surface. This is the one visible cost, and it is
smaller than Mapbox's required logo-plus-attribution.

Stadia and MapTiler were viable but rejected as unnecessary — Stadia's free tier
disallows commercial use, which a private family app almost certainly clears, but
"almost certainly" is not worth taking when Protomaps has no such clause.

If Komoot's public Photon instance ever goes away, geocoding is self-hostable
(the planet database is ~95 GB) or replaceable — and crucially, **the coordinates
already stored stay ours**, so losing the geocoder never costs us a pin.
