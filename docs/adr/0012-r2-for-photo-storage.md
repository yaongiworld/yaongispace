# Photos live on Cloudflare R2, not Supabase Storage

Everything else in Yaongispace runs on Supabase — Postgres, auth, and the search
indexes. Putting photo bytes somewhere else is the one deliberate split in the stack, so
a future reader will reasonably ask why we accepted a second vendor for a two-person app
that is otherwise committed to *don't over-engineer*.

## The cost table did not decide this

It nearly did. Priced at 500GB and 2TB, R2 costs about $7 and $30 a month on top of the
$25 Supabase Pro plan; Backblaze B2 is roughly half that, Supabase Storage $8.50 and $41,
S3 the most expensive. But the library turned out to be **curated rather than complete** —
Google Photos remains the archive of record, and Yaongispace holds only the subset worth
looking at. At that volume every option costs pocket change, and price stopped being the
deciding input.

Two structural findings decided it instead.

## Supabase's egress meter is shared with the database

Supabase bills one egress quota — 250GB on Pro — across database, auth, API, edge
functions, log drains **and** storage. Media is the only thing in this app that could
plausibly exhaust it.

That is a coupling we would refuse regardless of price: it means the photo library is
able to break login. A heavy month of browsing, or one bulk re-download, would bill
against the same meter that serves authentication. Keeping bytes on a separate provider
makes the two failures independent, which for an archive meant to last decades is worth
more than the few dollars saved.

## Hosted Supabase cannot point at our own bucket

Supabase Storage *exposes* an S3-compatible API, which reads at first glance like an exit
ramp. It is not. The compatibility runs **outbound only** — bring-your-own-bucket works
solely on self-hosted Supabase, and the feature request to allow it on hosted has sat
open for years.

So the reassuring migration story — adopt Supabase Storage now, swap the backend later —
does not exist. Moving off it means rewriting the storage layer, not editing a config
value. Choosing it would have been a genuine one-way door, taken for convenience.

## Why R2 over the cheaper B2

B2 is about half R2's price and is real object storage. We chose R2 anyway, for a single
property: **zero egress fees, on every storage class, with no cap**.

B2's free egress is capped at three times the stored volume per month. That cap is
invisible during normal use and bites on exactly one occasion — the day you download the
whole archive to leave. Paying a toll to exercise the exit is the failure mode
*avoid lock-in* exists to prevent, so we paid roughly $16/month more at 2TB to delete the
toll entirely. For data we intend to keep for decades and migrate at least once, zero
egress is not a discount; it is the removal of a hostage situation.

## What we accepted

A second vendor, a second dashboard, and a second account whose loss would matter. We
also gave up Supabase's image transformations, which work only on Supabase-hosted files —
so renditions are generated at import with `sharp` instead. That turned out to be
preferable anyway, since it makes serving cost flat rather than per-view.

`rclone` speaks R2, B2, S3 and SFTP natively, so nothing here is a one-way door at the
byte level. The split is reversible; the shared egress meter would not have been.
