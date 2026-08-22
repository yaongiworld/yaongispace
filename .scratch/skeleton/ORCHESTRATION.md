# Orchestration — running the skeleton tickets in parallel

How to dispatch the skeleton tickets to subagents without them stepping on each
other. Read this before kicking off any parallel work.

## The honest shape of the graph

```
01 scaffolding ─┬─ 02 sign-in ── 03 schema + Entry + RLS ─┬─ 05 letters ── 06 home
                │                                          ├─ 07 calendar
                └─ 04 tab shell ──────────────────────────┴─ 08 photo import
```

**This graph is mostly a chain, and it does not parallelise as well as it
looks.** Say so up front rather than discovering it with four agents running:

- **01 is done.** It is on `feat/skeleton-scaffolding`.
- **02 and 04 can run in parallel right now.** That is the only genuine
  two-way fork in the whole graph.
- **03 is a hard bottleneck.** Five of the eight tickets sit behind it, and it
  cannot start until 02 lands. Nothing else can be parallelised past it.
- **05, 07 and 08 fan out three ways** once 03 and 04 are both merged. This is
  the one wide moment — and the one where isolation matters most.
- **06 is strictly last**, behind 05.

So the realistic schedule is **four waves**, not "kick everything off at once":

| Wave | Tickets | Parallelism |
|---|---|---|
| 1 | 02, 04 | 2 agents |
| 2 | 03 | 1 agent (bottleneck) |
| 3 | 05, 07, 08 | 3 agents |
| 4 | 06 | 1 agent |

Do not dispatch a ticket whose blockers have not **merged**. A subagent branched
from a blocker that is still in flight will conflict on exactly the files the
blocker is rewriting.

## Branch per agent

One branch per ticket, cut from the merged tip of its blockers:

```
feat/02-google-sign-in       from feat/skeleton-scaffolding
feat/04-tab-shell            from feat/skeleton-scaffolding
feat/03-schema-entry-rls     from 02 merged
feat/05-letters              from 03 + 04 merged
feat/07-calendar             from 03 + 04 merged
feat/08-photo-import         from 03 + 04 merged
feat/06-home-hearth          from 05 merged
```

Naming is `feat/<NN>-<slug>` so the branch and the ticket file are obviously the
same work.

**Use `isolation: "worktree"` when dispatching wave 3.** Three agents editing one
checkout will collide; a worktree gives each its own copy of the repo. Waves 1
and 2 have at most two concurrent agents touching disjoint areas, so a worktree
is optional there — but it costs little.

## The collision map

What each wave-3 ticket touches, so you can see where they overlap:

| | 05 letters | 07 calendar | 08 photos |
|---|---|---|---|
| Its own section route | ✅ own | ✅ own | ✅ own |
| A migration file | ⚠️ shared dir | ⚠️ shared dir | ⚠️ shared dir |
| Entry trigger for its kind | ⚠️ shared file | ⚠️ shared file | ⚠️ shared file |
| Tab shell | ✅ read-only | ✅ read-only | ✅ read-only |

**Two real collision points**, both created by ticket 03's design:

1. **Migration filenames.** Three agents each adding `00X_*.sql` will pick the
   same number. Assign numbers up front — 05 takes `004`, 07 takes `005`, 08
   takes `006` — rather than letting them collide.
2. **The Entry trigger.** Each section must emit Entries, and if 03 puts every
   kind in one function, three agents rewrite one file. **Ticket 03 should
   define one trigger function per source table**, not a single dispatcher —
   this is worth stating in 03's own work so the fan-out stays clean. Flagged
   here because it is an orchestration constraint discovered by planning the
   parallelism, and it is far cheaper to honour in 03 than to unpick in wave 3.

## What each subagent gets

Give the agent the ticket path and let it read the rest itself. The prompt
should carry:

- **Its ticket file**, e.g. `.scratch/skeleton/issues/05-letters-end-to-end.md`
- **The branch to create and the base to cut from** — explicitly, not "branch
  from main"
- **Read `CLAUDE.md`, `CONTEXT.md` and `docs/adr/` first.** The vocabulary is
  binding: Entry, Place, Visit, Journey, Letter, Note. No `user`, no `album`,
  no `moment`
- **Its migration number**, from the assignment above
- **Do not merge, do not push, do not touch another ticket's files.** Commit to
  its own branch and stop
- **Run `npm run typecheck`, `npm test` and `npx next build` before finishing** —
  and report honestly if they fail rather than reporting success

## Before dispatching a wave

1. Blockers are **merged**, not merely finished.
2. `npm run db:up` — the tests need real Postgres and every agent shares it.
   (One database, many agents: fine for reads, and each test run is
   self-contained, but if that proves flaky give wave 3 separate ports.)
3. `git branch --show-current` is the intended base.

## After a wave

Merge in ticket order, not completion order, and run the full suite after each
merge — three green branches can still conflict once combined. Then re-read this
file: the collision map changes as the app grows.

## What is not in the skeleton

Recall, the world map, generated letter designs, AI suggestions in letters, the
Takeout backfill script, and photo browse beyond a chronological grid.

Two things gate later work and only Tony can do them: **Commission the yaongi**
and **Run the first Takeout export**. Neither blocks any skeleton ticket, but
08's browse half stays deliberately thin until the export lands.
