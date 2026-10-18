# South America is a shared day document, edited by commands

PROJECT SOUTH AMERICA (the two of us planning the evening and training together) lives
at `/south-america` inside this app. It reuses sign-in, the two-person wall and the
deploy; it adds only `sa_` tables (migration 008) and touches nothing from 001–007.

**The day is one document per plan day**, not a set of columns. The planning rules —
a heart press locks the plan, a workout completion is per person, corrections keep their
history — are TypeScript in `lib/south-america/domain`, tested as pure functions. The
database holds the document, serialises two people editing it (row lock + version) and
refuses everyone who is not one of the two members.

**Phones send commands, not state.** "Pressed ❤️", "set Yangcho's arrival to 19:10". The
server applies each command to the *latest* day under the lock, so two people pressing
at once are ordered rather than overwritten, and a rule that has since become false
(the plan is locked) refuses the command instead of silently winning. Who did it comes
from the login (`sa_member`: Person → yangcho/tawi), never from the request body.

**The phone shows its own press at once** by running the same rules locally, queues the
command, and sends it. A command carries an id (`cid`) so a retry after a lost reply
lands once; the unsent queue survives a reload. The phone re-reads the server every few
seconds and when it comes back to the foreground — no websockets, because two people
do not need them and the pooled Postgres connection has no LISTEN.

## Consequences

Nothing is deleted: the app role has no DELETE grant on `sa_*`, corrections are
revisions inside the document, and `sa_change` keeps the order things happened in.

Binding a Person to a persona is a deliberate row in `sa_member`. Migration 008
backfills it once from the display names 토위 / 양초 that DEPLOY.md seeds; after that
nothing binds by name.

The prototype's browser-only pieces (localStorage, the DEV panel, backup/restore) are
not carried over. Moving a phone's old prototype data in is a separate, deliberate
import (preview → confirm → write → verify), not part of this change.
