---
id: 013
title: How importing photos should feel
label: wayfinder:grilling
status: open
assignee:
blocked-by: [001, 003]
---

## Question

The photos research killed automatic sync, so importing is now a thing the two of you
*do* rather than something that happens invisibly. That makes it a UX question, and a
load-bearing one — if importing is tedious, the library dies and the app's most
valuable section with it.

Decide:
- The primary path. Research recommends direct upload (share sheet / PWA file picker)
  as the reliable spine, Picker API for occasional "add from Google Photos", Takeout
  for bulk backfill. Confirm or revise.
- What the routine looks like — after a trip, do you dump 300 photos at once? Does the
  app nudge you? Is importing an occasional ritual or a background chore?
- The Takeout backfill: is the pre-app archive imported once at the start, and who does
  it? This may be a one-time task ticket rather than a product feature.
- Duplicate handling across three ingestion paths hitting the same photo.
- EXIF handling — dates and GPS survive via Takeout sidecars and direct upload, and
  feed map pins. Decide what's extracted and stored at import.
- What the user sees while 300 photos upload from a phone on mobile data.

Blocked on the photos research (closed — read it) and the data model.
