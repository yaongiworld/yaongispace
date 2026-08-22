# 02 — Google sign-in for exactly two people

**What to build:** Towee and Yangcho can sign in with Google and stay signed in. Anyone
else is refused, warmly, in Korean.

Signing in finds or creates a **Person** and attaches the Google account as a credential —
the Person owns the data, never the Google account, so losing the account never means
losing our life
([ADR-0006](../../../docs/adr/0006-identity-is-a-person-not-a-google-account.md)).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Google OAuth with **`email` and `profile` scopes only** — no sensitive or restricted
      scopes, so no verification, no CASA, no 7-day token fuse
      ([ADR-0005](../../../docs/adr/0005-google-for-sign-in-only.md))
- [ ] The allowlist is **a table, not a constant** — admitting a device or a family member
      later is a row, not a redeploy
- [ ] A non-allowlisted account gets a warm Korean refusal, not a stack trace or a raw 403
- [ ] Sign-in resolves to a Person; a second sign-in with the same Google account attaches
      to the **same** Person rather than creating a new one
- [ ] Sessions effectively never expire — the phone's lock screen is the real boundary
- [ ] Integration test: an allowlisted email signs in and resolves to a Person; a
      non-allowlisted one is refused
