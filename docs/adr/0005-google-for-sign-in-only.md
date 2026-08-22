# Google is used for sign-in only

A reader will reasonably wonder why an app with a photo library and a calendar does not
touch the Google Photos or Google Calendar APIs. Both were deliberately given up.

**Google Photos**: automatic sync is not available at any price. Google removed the
library-read scopes on 2025-03-31, leaving only app-created-data access, and the Picker
API requires a human tapping a Google-hosted UI each time with download URLs that expire
in about an hour. Photos instead arrive via a **PWA share target** and **scheduled
Takeout**, neither of which touches a Google API.

**Google Calendar**: sync is possible but `calendar.events` is a *sensitive* scope, and
using it forces OAuth verification to escape the 7-day refresh-token expiry that applies
to unverified apps. Events are native to Yaongispace instead; sync is deferred to a
later iteration.

We therefore request only `email` and `profile` — non-sensitive scopes needing no
verification, with no token expiry.

## Consequences

The app has **no sensitive or restricted scopes at all**: one cheap Google Cloud project,
one consent screen, no verification, no CASA assessment, and no 7-day fuse anywhere.

The alternative was two Cloud projects with different publishing statuses — a consent
screen has one status per project, so a verified calendar and an unverified picker
cannot coexist in one. That structural complexity bought an occasional convenience and
was not worth it.

When Google Calendar sync is picked up later, verification returns with it, and API
credentials get their own table rather than being read out of the auth session. Identity
and API access have different lifetimes and should not be conflated.
