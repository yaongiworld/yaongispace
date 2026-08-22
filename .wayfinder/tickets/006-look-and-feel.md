---
id: 006
title: What does bubbly and fun actually look like?
label: wayfinder:prototype
status: open
assignee:
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
