---
id: 003
title: The shared data model — what is a memory, a place, a letter?
label: wayfinder:grilling
status: open
assignee:
blocked-by: []
---

## Question

Everything else hangs off this, which is why it's first. Settle the core domain
entities and their relationships: letters, photos, places (visited and wished-for),
calendar events, notes, and whatever ties them together.

The load-bearing constraint: the chat agent reads *across* all sections (Q7 settled as
"retrieval over the whole app"). That only works if every section emits its content in
a retrievable, uniformly-addressable form from day one — cheap now, expensive to
retrofit. So this ticket must decide the common shape that makes cross-section
retrieval possible, not just six independent schemas.

Specifically resolve:
- Core entities, their fields, and their relationships.
- Whether there is a unifying concept (a "moment"? an "entry"?) that letters, photos,
  places, and events are all specialisations of — or whether forcing that is
  over-engineering.
- How time and place attach to things, given a trip generates photos, places, calendar
  entries, and probably a letter.
- Ownership: settled as **fully shared**, with letters carrying sender/recipient. No
  permissions system. Confirm nothing in the model needs to break that.
- What each section must emit for the chat agent to retrieve it.

Use `/domain-modeling` and record the ubiquitous language — this vocabulary should
outlive the map.
