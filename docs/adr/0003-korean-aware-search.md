# Trigram search, because Postgres cannot tokenize Korean

> **Revised 2026-08-23.** Originally *"pgroonga for search"*. The problem
> statement below was and remains correct; the chosen tool has changed to
> `pg_trgm`. The reason is in **Revision** at the end — pgroonga turned out to
> be the single thing forcing a $25/month host, and the app has no Supabase
> coupling otherwise. The upgrade path back to pgroonga stays open and is two
> `create index` statements.

Postgres has no `korean` text search configuration, and its default parser treats a run
of CJK characters as a single token. `to_tsvector('simple', '제주도에서')` therefore
produces one token, and **searching "제주" never matches it**. Korean is agglutinative —
particles attach directly to nouns — so this breaks most Korean content rather than an
edge case, and it would have shipped looking correct in English testing while silently
failing on half the corpus.

We use **pgroonga**, which is officially supported on Supabase, segments Korean
properly, and indexes English in the same index so there is only one search path.

## Considered options

`pg_bigm` and `mecab-ko`/`textsearch_ko` are the usual Korean answers but are **not
available on managed Supabase**, which allows only a fixed extension list — they would
require self-hosting Postgres. `pg_trgm` is Hangul-safe mechanically and useful for
typo tolerance, but knows nothing about particle boundaries, so it is a supplement at
best.

## Consequences

Retrieval is hybrid: pgroonga lexical results and pgvector semantic results fused with
Reciprocal Rank Fusion. This is not redundancy — embeddings reliably under-rank named
entities (place names, people, dates), which is exactly what gets searched most in a
memory archive. Bilingual Korean/English content, including sentences that code-switch
mid-clause, is handled by both halves.

## Revision (2026-08-23): pg_trgm instead, pgvector unchanged

**What did not change:** Postgres still cannot tokenize Korean.
`to_tsvector('simple','제주도에서')` still yields one token and searching 제주
still matches nothing. Verified again while making this change. Everything in
the problem statement above stands.

**What changed:** pgroonga is available on Supabase and effectively nowhere
else — not Neon, not Naver Cloud (whose managed Postgres publishes a fixed
extension allowlist without it), not a stock Postgres. Since the app talks to
Postgres through plain `pg` with no Supabase SDK anywhere, pgroonga was the
*only* thing tying us to a $25/month plan. Paying that for one extension,
before the feature that needs it exists, is the kind of cost this workspace
tells us not to take on.

`pg_trgm` ships with every Postgres. Trigrams have no notion of a word, which
is exactly why they survive Korean where the tokenizer does not: the trigrams
of 제주도에서 contain those of 제주. Verified against a Postgres with no
pgroonga available — 제주, 하루, Busan, 밀면 and 맛있 all match, including in a
code-switched sentence, while `to_tsvector` finds nothing.

**What we give up**, honestly:

- **Morpheme boundaries.** A trigram can straddle two words and match something
  meaningless. pgroonga knows where words end.
- **Ranking.** pgroonga scores matches; `ILIKE` is a yes/no, so the lexical half
  of RRF contributes rank by recency rather than by relevance.

At two people's volume — thousands of Entries, not millions — that is a modest
quality difference rather than the silent total failure `tsvector` produces.

**Retrieval is still hybrid**, and that part of the original reasoning is
untouched: embeddings under-rank named entities — place names, people, dates —
which is exactly what a memory archive gets searched for. Vector-only was
considered and rejected for that reason, and because it would make every search
an API call, so search would not work offline and every question about our
private life would leave the machine.

**The upgrade path.** On a host with pgroonga, `create extension pgroonga` plus
two indexes alongside the trigram ones. No application code changes, because
nothing queries either index directly yet. `tests/entry.test.ts` accepts either
index, so it does not have to be edited to make that move.
