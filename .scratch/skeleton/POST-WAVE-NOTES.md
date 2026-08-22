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

## 2. `asPerson` exists twice

`lib/letters.ts` and `lib/photos/as-person.ts` each define it. They are
semantically identical — same JWT claim, same `SET LOCAL ROLE`, same
transaction scoping — and differ only in whether they hand the caller a
`PoolClient` or a narrowed query function. Two agents solved the same problem in
isolation, which is the expected cost of the fan-out, not a mistake by either.

Worth collapsing into one before a fourth section copies whichever it finds
first. The photos version is the more general of the two.

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

## 5. R2 has never been contacted

`lib/photos/storage.ts` presigns with hand-rolled SigV4 and has never spoken to
Cloudflare — no bucket and no credentials exist yet. Tests assert URL shape and
that the signature covers the request; they cannot catch a wrong assumption
about what R2 accepts. **First contact with a real bucket is still ahead**, and
it is the most likely place for this skeleton to be wrong in production.
