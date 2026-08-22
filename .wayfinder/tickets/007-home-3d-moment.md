---
id: 007
title: The one 3D moment on the home page
label: wayfinder:prototype
status: open
assignee:
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

Blocked on look-and-feel — the 3D moment has to sit inside an established visual
language, not invent one.
