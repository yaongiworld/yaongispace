---
id: 006
title: What does bubbly and fun actually look like?
label: wayfinder:prototype
status: closed
assignee: session-2026-08-22-e
closed: 2026-08-22
blocked-by: []
---

## Question

"Bubbly and fun" is the stated goal, themed around cats and zzingni. That's a feeling,
not a spec — so make something cheap and concrete to react to rather than arguing in
the abstract.

Build a rough prototype (use `/prototype`) of the home screen and one other section on
a phone-sized viewport, and settle:
- Colour, type, roundness, density. Bubbly usually means generous radii, soft shadows,
  springy motion, warm palette — confirm against Towee and Yangcho's actual taste.
- Where zzingni characters appear and how often. There's a real risk of charming-at-
  first, grating-by-week-three; decide what's permanent furniture vs. occasional
  delight.
- The motion vocabulary for 2D (transitions, reactions, loading states) — this carries
  most of the "fun", not the 3D.
- Korean/English handling in the type system, since both will appear. Note the bilingual
  strategy ticket (015) owns the language decisions; this ticket owns how Hangul and
  Latin look good together — they need different line-height and letter-spacing, and a
  font chosen for Latin alone will render Korean badly.

**Constraint**: zzingni assets are used under private-use-only. This app cannot become
public, go in an app store, or appear in Yangcho's MBA portfolio while it uses them.
Recorded consciously as a decision, not an assumption.

Asset note: zzingni emoticons are obtained via download. Record where they live and in
what formats.

---

## Resolution (2026-08-22)

Prototypes: [`prototypes/look-and-feel.html`](../../prototypes/look-and-feel.html) (three
directions) and [`prototypes/soft-clay.html`](../../prototypes/soft-clay.html) (the chosen
one, with real assets). Font research: [`docs/font-research.md`](../../docs/font-research.md).

### Direction: Soft Clay

Chosen from three built directions (Soft Clay, Paper Diary, Night Neon). Warm
peach-to-pink-to-lilac gradient background, puffy white cards with generous radii
(24–34px), soft shadows plus a subtle inset highlight on the bottom edge that gives the
"pressed clay" feel, and a warm brown ink colour (`#4a3b33`) rather than black.

### Emoji and icons: Microsoft Fluent Emoji 3D

**MIT licensed, no attribution required in the UI.** Its puffy, glossy 3D rendering is
the closest free match to Soft Clay, and — unlike system emoji — it renders **identically
on iOS, Android and web**, which matters for an app whose whole surface is characters.

Ships as pre-rendered **PNG, not SVG**: raster, roughly 18–43KB per asset, fine at fixed
UI sizes but not infinitely scalable. A working set of ~12 assets is ~350KB.

Rejected, with reasons worth keeping:
- **JoyPixels** — free tier is personal-use only and bans commercial use outright.
- **OpenMoji** — CC BY-SA; ShareAlike taints derivatives if a UI kit is ever published.
- **Twemoji** — `twitter/twemoji` is archived; `jdecked/twemoji` is the maintained fork,
  still CC-BY and so requires visible credit. Fluent requires none.
- **Blobmoji** — thematically close but abandoned since 2017, which fights *long-lived
  data*.

For plain UI chrome (buttons, toolbar controls) use **Phosphor (Duotone/Fill)** or
**Iconoir** — both MIT, both soft enough alongside puffy cards.

### Typography: Pretendard, self-hosted

**`next/font/google` silently filters CJK subsets out of its output** (Next.js docs and
PR #44594), so a Korean font loaded through it fails to preload correctly — surfacing as
font flashing or tofu rather than an error. **Korean faces must be self-hosted via
`next/font/local`.** Latin-only faces are fine through the Google loader.

**Pretendard** (OFL 1.1) is the body face and dissolves the pairing problem: its Latin
glyphs are drawn to match its Hangul, so mixed 한글/English sentences do not seam
mid-line — no baseline or x-height mismatch to correct. Its pre-built subset is ~261KB
against ~1.96MB for the full variable font.

For playful display headings, **BM Jua** (Korean, OFL — the only Baemin restriction is
against reselling the font file) paired with **Fredoka** (Latin).

Where two faces do meet on one line, `ascent-override` / `descent-override` /
`size-adjust` are exposed directly by `next/font/local`'s `declarations` option.

Avoid **Ownglyph** regardless of aesthetic fit: it prohibits modification and
redistribution outright, and the service has posted a shutdown notice.

### Characters: one cat, one place

The hero cat is the **only** character on screen, and it is permanent furniture in a
single spot rather than sprinkled through the UI. This is the direct answer to the
ticket's own worry — *charming at first, grating by week three*. It reacts to what is
happening (a waiting letter, a new place) rather than idling decoratively.

Everything else uses Fluent assets as *icons*, not as characters.

### Navigation: a tab bar, with the shortcut grid kept

The brief asked for shortcut navigation on the home page, and the prototype showed both.
A five-item **tab bar** (home · letters · photos · map · recall) does the real work —
thumb-reachable, always present, correct for a mobile-first app.

The home shortcut grid is retained but demoted: it is a *warm* entry point rather than
the primary navigation, and it duplicates the tab bar by design. If it proves redundant
in use, the home page ticket may drop it.

### Motion

Motion carries most of the "fun", not 3D. The vocabulary: a slow idle bob on the hero cat
(~3.6s, translate plus slight rotate), springy scale on tap, gentle upward scale on the
active tab icon. All motion respects `prefers-reduced-motion`.

### Light only — no dark mode

**Decided: the app ships light only.** Soft Clay is inherently a light aesthetic, and a
dark variant of a warm peach-and-pink gradient is not the same design in another palette
— it is a second design. For two people who will mostly open this in daylight moments,
maintaining two is *don't over-engineer* territory.

Colours are still defined as tokens on `:root` rather than inlined, so this stays a
palette swap if it is ever wanted. But the app should **not** ship
`prefers-color-scheme` overrides that were never designed or looked at — a
half-considered dark mode is worse than none.

One consequence to honour: because the app opts out of dark mode, it must say so —
`color-scheme: light` on the root — so mobile browsers do not auto-darken form controls
and scrollbars against a light design.

### The zzingni constraint stands — for now

Fluent is used throughout **for now**, including the hero cat. Recorded consciously:
using Microsoft's cat as the app's primary mark means the app's face is Microsoft's
drawing.

The zzingni private-use-only restriction from charting therefore **still stands** — this
app cannot become public, enter an app store, or appear in Yangcho's MBA portfolio while
it uses third-party character art. Commissioning an original clay cat (or Yangcho drawing
one) is the thing that would buy that back; it is now a graduated fog item rather than a
lost idea.

### Asset provenance

Fluent Emoji 3D PNGs pulled from `microsoft/fluentui-emoji` via the jsDelivr CDN mirror.
Working assets live in [`prototypes/assets/`](../../prototypes/assets/). In the real app
they belong in `/public`, loaded with `next/image`; UI chrome icons should come through
SVGR as React components so they tree-shake and inherit `currentColor`.
