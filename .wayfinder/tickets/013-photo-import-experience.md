---
id: 013
title: How importing photos should feel
label: wayfinder:grilling
status: open
assignee:
blocked-by: [001, 003, 005]
---

## Question

The photos research killed automatic sync, so importing is now a thing the two of you
*do* rather than something that happens invisibly. That makes it a UX question, and a
load-bearing one — if importing is tedious, the library dies and the app's most
valuable section with it.

Decide:
- **Settled by the auth ticket: the Picker API is dropped.** Photos arrive by two paths
  only — a **PWA share target** (share from the phone's photo app, two taps) and
  **scheduled Takeout** for backfill. No Google API is involved in either, which is why
  the app now has no sensitive scopes at all. This ticket designs the *experience* of
  those two paths, not which paths exist.
- The share-target flow specifically: what the PWA manifest must declare, what happens
  when 40 photos are shared at once, and what the user sees while it uploads.
- What the routine looks like — after a trip, do you dump 300 photos at once? Does the
  app nudge you? Is importing an occasional ritual or a background chore?
- The Takeout backfill: is the pre-app archive imported once at the start, and who does
  it? This may be a one-time task ticket rather than a product feature.
- Duplicate handling across three ingestion paths hitting the same photo.
- EXIF handling — dates and GPS survive via Takeout sidecars and direct upload, and
  feed map pins. Decide what's extracted and stored at import.
- What the user sees while 300 photos upload from a phone on mobile data.

Blocked on the photos research (closed — read it) and the data model.
