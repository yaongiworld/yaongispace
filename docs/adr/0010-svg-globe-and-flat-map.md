# The world view is an SVG globe; the place view is a flat map

[ADR-0008](0008-css-3d-not-webgl.md) rejected WebGL on the home page and scoped 3D to
home only this iteration. A future reader will see a globe in the map section and read
it as that rule being broken. It is not: the globe that was rejected and the globe that
shipped are different things.

## Two renderers, deliberately

| view | renderer | job |
| --- | --- | --- |
| **World** | d3-geo orthographic **SVG** globe, ~45 KB gzipped | the *record* — look where we have been |
| **Place** | MapLibre + Protomaps ([ADR-0009](0009-maplibre-protomaps-and-osm-geocoding.md)) | the *portal* — tap into what happened there |

The globe is a sphere with country outlines and pins, no tiles: `d3-geo` (12 KB) +
`topojson-client` (3 KB) + `versor` (2 KB) + world-atlas 110m outlines (~28 KB gzipped).

## Why this is not what ADR-0008 ruled out

That ADR rejected ~600 KB of three.js and a **measurably warm phone**. This globe is
**plain SVG paths** — no WebGL, no GPU context, no continuous render loop — so it is
dramatically kinder to the battery than the option that lost, not a reopening of it.
The alternatives measured: MapLibre v6's built-in globe projection at 138 KB, and
`globe.gl` at 487 KB (it bundles three.js). `cobe` is smaller still at 5 KB but is a
WebGL sphere, and cannot take a pastel palette as CSS.

SVG paths take Soft Clay's colours **directly as CSS fills**, which no GL option does.
That is the second reason it wins: the globe is a keepsake surface, and here it is
styled by the same stylesheet as everything else.

A tiled globe would also have needed a world basemap offline — roughly 60–80 MB at zoom
0–6. The SVG globe needs none, so the offline problem disappears rather than being
solved.

## Consequences

Two map renderers is real complexity, and it is the price of this decision. It is paid
back by the split matching the section's own structure: the globe answers "where have we
been", the flat map answers "what happened here". Neither renderer does the other's job
well, which is why one library for both would have compromised somewhere.

Zoom 0–4 Protomaps tiles (~5–10 MB) remain the sweet spot if the flat map is ever wanted
offline. The globe is already offline by construction.

The globe is **the world view, not a hero ornament** — it is interactive, drag to spin,
tap a pin to drop into the flat map. Had it been merely decorative it would not have
earned even 45 KB.
