# pgroonga for search, because Postgres cannot tokenize Korean

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
