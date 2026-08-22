---
id: 011
title: Where does it live, and how do we get our data out?
label: wayfinder:grilling
status: open
assignee:
blocked-by: [001]
---

## Question

Stack is settled (Next.js + Supabase + Vercel, PWA-installable). What is *not* settled
is photo storage, which is where the `long-lived data` and `avoid lock-in` principles
actually bite.

- Photo storage: Supabase Storage vs. S3/R2 vs. self-hosted. Decades of family photos
  and video is the real cost driver. Model the actual bill at a realistic volume, not
  a toy one.
- Originals vs. derivatives — what's kept at full fidelity, what's generated, and
  whether originals are ever touched. For a keepsake archive, originals should be
  immutable.
- **The exit path.** If Supabase or Vercel vanishes or gets expensive, how do the two
  of you get everything — photos, letters, notes, places — out in a usable form? This
  is a binding principle, so treat it as a requirement, not a nice-to-have.
- Backup: what protects against accidental deletion and against provider failure.
  Photos and letters are irreplaceable in a way that most app data is not.
- Free-tier limits and what happens the day one is exceeded.

Blocked on the photos research, since how photos arrive shapes what has to be stored.
