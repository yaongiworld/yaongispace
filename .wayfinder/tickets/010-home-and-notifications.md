---
id: 010
title: What greets you when you open the app?
label: wayfinder:grilling
status: open
assignee:
blocked-by: [006, 014]
---

## Question

The home page carries two jobs from the brief: activity notifications (letters, new
destinations, updates) and shortcut navigation to every section.

- What is the home page *for*, emotionally? A dashboard, or a front door? A warm
  "here's what's new with us" beats a status board for an app you open daily.
- Notification model: what generates one, how "read" is tracked, whether they're per
  person (Yangcho should see "Towee wrote you a letter", not her own actions).
- Are notifications ever *pushed* to the phone, or only in-app? Push means service
  workers, permissions, and a whole subsystem — decide if it earns that.
- Navigation: is it home-page shortcuts, a persistent tab bar, or both? Mobile-primary
  argues for a tab bar with home as one destination among several.
- What home shows when nothing has happened — the empty state is the common case for a
  two-person app on a quiet Tuesday, and it should still feel warm.
- Where the 3D moment sits without crowding the content.

**Note**: the notification *model* moved to its own ticket (014) once the Entry index
made it specifiable. This ticket consumes that decision and focuses on the home page as
an experience — what greets you, how you navigate, what the empty state feels like.

Blocked on look-and-feel and the notification model.
