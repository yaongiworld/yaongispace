---
id: 007
title: The one 3D moment on the home page
label: wayfinder:prototype
status: closed
assignee: session-2026-08-22-f
closed: 2026-08-22
blocked-by: [006]
---

## Question

3D is confined to the home page this iteration and improvable later. Decide what that
single moment *is* and prove it survives a real phone.

- What is it? A reactive cat that responds to touch is the obvious candidate; a
  spinning globe belongs to the world map section, not home.
- Tech: Three.js / React Three Fiber vs. a rendered sprite sequence vs. Rive/Lottie.
  Cheapest thing that delivers the feeling wins — a pre-rendered loop may be
  indistinguishable from real 3D at phone size and far kinder to the battery.
- Budget: bundle size, battery, and thermals on the phone you actually carry. Must
  lazy-load and must not block first paint.
- Graceful degradation on a weak connection or reduced-motion preference.

**Now unblocked.** The visual language is Soft Clay, and the hero cat is already
established as the one character, in one place, reacting rather than idling — so this
ticket decides how much *dimension* that cat gains, not what it is.

Two constraints inherited from look-and-feel:
- Fluent Emoji 3D assets are **pre-rendered PNG**, so the cat is currently raster. Real
  3D would mean replacing it with a model — a bigger change than "add animation".
- The current idle bob is CSS. Ask honestly whether real 3D beats a well-made sprite
  sequence or Rive/Lottie at phone size, given the battery cost.

---

## Resolution (2026-08-22)

Prototypes: [`cat-dimension.html`](../../prototypes/cat-dimension.html) (three motion
approaches), [`pick-the-yaongi.html`](../../prototypes/pick-the-yaongi.html) and
[`cats-not-microsoft.html`](../../prototypes/cats-not-microsoft.html) (mascot candidates).

### Motion: pseudo-3D (CSS 3D transforms), not WebGL

Three approaches were built and compared live at phone size:

| Approach | Added weight | Battery | Feels alive? |
| --- | --- | --- | --- |
| CSS bob + squash | 0 KB | negligible | yes |
| **Pseudo-3D tilt + spin** | **0 KB** | **negligible** | **yes, slightly more** |
| Real WebGL (three.js) | ~600 KB | measurably warm | yes — but not 600 KB more |

**At 132px, real 3D was not distinguishable enough from CSS to justify its cost.** The
perceived liveliness comes from the **reaction**, not the rendering — a squash-and-sparkle
on tap does more emotional work than real geometry. Building the WebGL version also
exposed a hidden dependency: real 3D needs a real *modelled* cat, which is a far larger
job than "add an animation".

Decided: **CSS 3D transforms on a flat asset** — perspective tilt on the idle bob, full
spin on tap. Zero bytes, GPU-composited, degrades to a still image under
`prefers-reduced-motion`, works offline.

WebGL is not ruled out forever. It earns its cost only if the cat becomes something
genuinely manipulated — dressed, posed, played with. As a greeting that bobs and reacts,
it does not.

### The mascot: an original yaongi, commissioned

Fluent's cat was rejected by the user as too lame, and surveying the alternatives showed
why the problem is not fixable by shopping: **every emoji set is a cat *glyph*, drawn to
sit inside a line of text — none were drawn to be a mascot.** Swapping Microsoft's cat
for Google's trades one utilitarian cat for a rounder utilitarian cat.

**Decided: commission an original clay yaongi** — drawn by Yangcho, commissioned from an
artist, or generated on a paid Recraft plan (true SVG output, full commercial rights).
Tracked as its own task ticket; it blocks nothing.

**This lifts the zzingni restriction** — see the map's Out of scope section. An original
mascot means the app is no longer bound by third-party character IP and *could* be made
public, listed, or shown in Yangcho's MBA portfolio.

### The mascot has moods

The hero is a plain image swapped by state, so the cat reacts to what is actually
happening: heart-eyes when a letter waits, tears of joy after a trip import, weary at 2am,
pouting when nobody has opened the app in a week.

Zero extra infrastructure — same element, different source. This is a better answer to the
ticket's *charming at first, grating by week three* worry than any single expression,
because the cat stops being wallpaper and starts responding to your life. **The commission
must therefore cover one resting face plus a set of mood variants**, not a single drawing.

Useful precedent: Unicode's cat-face cluster (U+1F638–1F63F) is exactly this structure —
grinning, joy, heart-eyes, smirk, weary, screaming, crying, pouting. It is a good brief
for what expressions to ask for.

### Interim asset

Until the commissioned mascot exists, use **Google Noto** flat cats (Apache-2.0, no
attribution) rather than Fluent for the hero — rounder and softer. **Explicitly a
placeholder.**

Watch **Noto 3D**: Google announced a fully volumetric emoji redesign at I/O 2026, live on
Pixel 11 as of 2026-08-20. It is the exact clay aesthetic this app wants. **Not
downloadable yet** — verified against the repo, which still holds only flat assets, and a
third-party blog claiming otherwise is wrong. Google has stated intent to publish `.OBJ`
files; no license or date confirmed. Worth re-checking, though the commissioned mascot
supersedes it for the hero.

### Licence caution recorded

**LottieFiles' own documentation contradicts itself**: the per-asset Lottie Simple License
permits commercial use, while their account-plan docs call the free plan "strictly
non-commercial". **Licence is per-asset, not per-tier** — a "Free" badge is not a safe
signal. Do not build on Lottie assets without checking the individual asset's licence.

Also: `jdecked/twemoji` is CC-BY only (attribution, no ShareAlike), making it strictly
more permissive than OpenMoji for the same cat set, should a fallback ever be needed.
