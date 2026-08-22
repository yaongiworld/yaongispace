---
id: 005
title: Google sign-in for exactly two people
label: wayfinder:grilling
status: open
assignee:
blocked-by: []
---

## Question

Google OAuth is primary auth (settled). Voice is deferred entirely. What's left is
smaller but genuinely fiddly:

- Supabase Auth with the Google provider vs. rolling it directly — and how it
  interacts with the Google API scopes that photos and calendar need. Are these one
  OAuth grant or several?
- The allowlist: exactly two accounts may enter. How is that enforced, and what does a
  third person see?
- Session lifetime on a phone. This is the ritual-adjacent decision — the app should
  essentially never log you out, since re-authing to look at your own photos is
  friction with no security benefit for a 2-person private app.
- Where Google refresh tokens live, given both photos and calendar need long-lived
  API access. This may collide with findings from the research tickets, especially
  the testing-mode token expiry question.
- What happens if a Google account is lost — the *long-lived data* principle says
  losing an account must not mean losing decades of photos.

Leave a clean seam for voice to be added later as a ritual layer, without designing it.
