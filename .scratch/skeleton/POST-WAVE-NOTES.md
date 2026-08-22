# Post-wave notes — things the fan-out created

Written after merging tickets 05, 07 and 08. ORCHESTRATION.md says to re-read
the collision map after a wave; these are the things that changed underneath it.
None is a bug in a ticket — each is a seam that only became visible once three
parallel branches sat in one tree.

## 1. Three sections, three different RLS postures

The app pool connects to Postgres as the **owner**, and the owner bypasses every
RLS policy. Ticket 02 never noticed because `sign_in_with_google` runs before
there is a Person to be. After wave 3 the tree holds three different answers:

| Section | Connects as | Consequence |
|---|---|---|
| Letters | `yaongi_signed_in` via its own `asPerson` | policies enforced |
| Photos | `yaongi_signed_in` via `lib/photos/as-person.ts` | policies enforced |
| Calendar | the owner, `db()` directly | **policies bypassed** |

**This is not currently a leak.** Events are shared by both of us by design —
there is no per-person ownership on the calendar, so a bypassed policy grants
nothing a correct policy would refuse. Letters are the section where it would
matter, and letters do it right.

But it is a trap for whoever adds the next section: the default (`db()`) is the
unsafe one, and it is unsafe silently. Deciding this deliberately is cheap now
and expensive after Recall reads across everything.

## 2. `asPerson` existed three times — **fixed**

Letters, photos and News each grew their own copy while being built in
parallel. All three were semantically identical: same JWT claim, same
`SET LOCAL ROLE`, same transaction scoping. Three agents solving one problem in
isolation is the expected cost of the fan-out, not a mistake by any of them.

Collapsed into **`lib/as-person.ts`**, the photos version being the most
general; letters and News delegate to it. Three copies of the rule that decides
who may read a sealed Letter is three places for it to drift.

`tests/home-ui.test.ts` asserted that `lib/news.ts` literally contained
`SET LOCAL ROLE`, so the move broke it — correctly, since it is guarding the
most important constraint in the section. It now asserts both that News goes
through the helper *and* that the helper still drops the role, which is
stricter than what it replaced: checking only the former would pass against a
helper that had quietly stopped doing its job.

## 3. Two tables deliberately outside the Entry index

Ticket 08 added `import_upload` and `place_proposal` and gave neither an Entry
trigger, on the reasoning that a file waiting to upload is an errand and
unconfirmed GPS is a question — and that indexing the latter would put
"37.5665, 126.9780" into Recall's answers, which is the exact failure ADR-0002
avoids by other means. `rebuild.test.ts`'s guard only inspects tables that
already have an `entry_from_*` trigger, so this stays consistent rather than
silently defeating the guard.

Recorded because "every table emits an Entry" is otherwise a fair reading of
ADR-0001, and the next person to notice these two should find the reasoning
rather than the absence.

## 4. Column names that dodged ticket 03's occurred-at test

`schema.test.ts` enumerates every table on the primary time axis. Two wave-3
agents hit it and both renamed their column rather than editing the test:

- calendar's view exposes `stored_on`, not `occurred_at`
- `place_proposal` carries `photo_occurred_at`, not `occurred_at`

Both renames are truer to what the column means. Noted so the asymmetry reads as
a decision rather than an oversight.

## 5. One view is owner-rights, and views default that way

Ticket 06 found that **a Postgres view reads its base tables as the view's
owner**, who holds `rolbypassrls`. Its `news` view therefore declares
`with (security_invoker = true)`; without it the view returned a Letter sealed
until 2036 that a direct select on `entry` correctly hid.

`imminent_event` (migration 005) does **not** declare it. I probed this
directly: as a non-owner Person the view returns the same rows as a direct
query on `event`, so **it is not currently a leak** — Events are shared by both
of us by design and carry no per-person visibility rule. It is latent risk
rather than a live bug, and it only stays that way while that remains true. If
that view ever selects a column from `entry` or `letter`, or Events ever gain a
visibility rule, it becomes one silently.

The general lesson is the trap, not the instance: **a new view is owner-rights
unless it says otherwise**, which is the unsafe default, exactly like `db()` in
note 1.

## 6. R2 has never been contacted

`lib/photos/storage.ts` presigns with hand-rolled SigV4 and has never spoken to
Cloudflare — no bucket and no credentials exist yet. Tests assert URL shape and
that the signature covers the request; they cannot catch a wrong assumption
about what R2 accepts. **First contact with a real bucket is still ahead**, and
it is the most likely place for this skeleton to be wrong in production.
