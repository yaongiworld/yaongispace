---
id: 017
title: Commission the yaongi
label: wayfinder:task
status: open
assignee:
blocked-by: []
---

## Question

Nothing to decide — this is work. Every existing emoji set is a cat *glyph* drawn to sit
in a line of text, not a mascot, which is why none of them felt right. The yaongi has to
be drawn.

**Route** (user's call, and one of these): Yangcho draws it · commission an artist ·
generate on a paid Recraft plan (true SVG output, full commercial rights — note the free
plan grants no commercial rights and Recraft retains ownership).

**Brief for whoever draws it:**
- A cat in the **Soft Clay** language: puffy, rounded, soft-shadowed, warm. It should look
  at home on a peach→pink→lilac gradient card. Not flat, not line-art, not glossy-corporate.
- **A resting face plus mood variants** — the hero swaps by app state, so a single drawing
  is not enough. Unicode's cat-face cluster (U+1F638–1F63F) is a good brief for the range:
  grinning, tears of joy, heart-eyes, smirk/wry, weary, crying, pouting.
  Minimum useful set: **resting, letter-waiting (heart-eyes), delighted, sleepy**.
- **A whole cat, not a floating head.** A body reads as a creature; a face reads as an
  emoji. This was the specific problem with the candidates reviewed.
- Renders legibly at **~120px on a phone** — that is the only size that matters.
- Consistent style across all moods (same character, different expression). If generating,
  lock a style reference or LoRA; consistency across poses is the hard part.
- **SVG preferred** over raster, so it scales. Recraft outputs true SVG; a hand-drawn cat
  should be vectorised.

**Resolution should record**: which route was taken, where the source files live, the
licence or ownership terms, and the exported asset paths.

**Consequence when done**: this removes the last third-party character IP from the app and
**lifts the zzingni private-use-only restriction** — Yaongispace could then be made public,
listed in an app store, or shown in Yangcho's MBA portfolio. See the map's Out of scope.

Until this lands, the hero uses Google Noto flat cats (Apache-2.0) as an explicit
placeholder.
