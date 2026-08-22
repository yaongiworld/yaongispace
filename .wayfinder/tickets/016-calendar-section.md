---
id: 016
title: A shared calendar that is ours
label: wayfinder:grilling
status: open
assignee:
blocked-by: [003, 006]
---

## Question

The auth ticket made Events **native to Yaongispace** rather than a mirror of Google
Calendar, so the calendar section needs designing as its own thing. It was previously
assumed to be "whatever Google sync gives us", which is no longer true.

- **What is a shared calendar for two people?** Not a work calendar. Anniversaries,
  trips, appointments worth the other knowing about, things to look forward to. The
  design should follow that, not Google Calendar's shape.
- **Views**: month grid, agenda list, or something warmer. Mobile-first, so the month
  grid may be the wrong default — an agenda of what's coming reads better on a phone.
- **Recurrence**: needed at all? Anniversaries recur yearly and little else does. Full
  RRULE support is a large piece of machinery; a yearly repeat flag may cover reality.
- **Events and Journeys**: a trip is a Journey *and* probably several Events. Decide
  whether creating one from the other is worthwhile or coupling for its own sake.
- **Reminders**: does the app notify before an event, and does that need push? Overlaps
  with the notification model ticket (014) — settle the boundary between them.
- **The absent phone calendar.** Events live here, so they will *not* appear on the
  phone's native calendar. Decide whether that is acceptable or whether an export
  (subscribable `.ics` we publish) closes the gap cheaply without any Google API.

**Note**: Google Calendar sync is deferred, not cancelled — see Not yet specified on the
map. The model is designed so sync later becomes a mirror onto Events we already own,
never a reshaping of them.
