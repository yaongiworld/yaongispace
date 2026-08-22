---
id: 004
title: How does the chat agent know our life?
label: wayfinder:grilling
status: closed
assignee: session-2026-08-22-c
closed: 2026-08-22
blocked-by: [003]
---

## Question

Settled already: the agent retrieves across the whole app (notes plus letters, photos,
places, calendar), and is **read-only** this iteration. Letters are permanently
agent-free for *writing* — the emotional weight of the section depends on the words
being genuinely yours.

Remaining to decide:
- Retrieval mechanism: embeddings/pgvector, keyword/full-text, structured query over
  Postgres, or a hybrid. Supabase gives all three; pick and justify.
- What the notes section itself is — freeform documents, structured entries, or both.
- Model choice and the cost envelope for two people.
- Where inference runs (Vercel function, Supabase edge function, elsewhere).
- Privacy: *privacy by default* is binding, and this feature ships the most intimate
  data in the app to a model provider. Decide consciously what leaves the house, and
  whether any local/self-hosted option is worth it.
- What the agent's failure mode looks like — confidently wrong recall about your own
  shared history is worse than a shrug.

Blocked on the data model, since retrieval design depends on what it retrieves over.

---

## Resolution (2026-08-22)

### Recall is a search box that speaks, not a companion

This iteration Recall finds and surfaces *your own Entries* in response to a natural
question ("when did we go to Jeju?"). It does not hold a conversation, keep a thread, or
have a personality.

Reasoning: the ticket named the failure mode itself — *confidently wrong recall about
your own shared history is worse than a shrug* — and prose answers are exactly where a
model smooths over gaps. A search box is also useful on day one with twenty letters in
the database, whereas a companion needs a deep archive before it has anything to be
companionable about. Nothing here forecloses the companion later; it is a layer on top
of working retrieval, not a different foundation.

### Sources are always shown — non-negotiable

Every answer displays the Entries it was drawn from. For a memory archive this *is* the
trust model: an answer with the actual letter underneath is verifiable, while an answer
floating alone is a language model making claims about your marriage.

This also buys a graceful failure mode. Showing three plausible Entries and saying "I'm
not sure" is genuinely useful; a confident wrong sentence is corrosive. **Recall should
under-claim.**

### A Note is freeform. That is the whole schema.

Title and markdown body. No typed kinds, no required fields, no tags.

Structured note kinds (recipes, book lists, gift ideas) were rejected: they require
predicting which kinds you will want, and you will be wrong — you will want "the thing
the vet said" at 11pm and there will be no schema for it. Freeform text is also the
ideal substrate for retrieval, since a body is precisely what gets indexed. If a real
pattern emerges after a year of use, *that* is the evidence for structure.

### Retrieval: hybrid pgroonga + pgvector, fused with RRF

**Postgres cannot tokenize Korean.** There is no `korean` text search configuration, and
the default parser treats a run of CJK characters as a single token — so
`to_tsvector('simple', '제주도에서')` yields one token and **searching "제주" never
matches it**. Korean is agglutinative (particles 은/는/이/가/을/를 attach to nouns), so
this breaks most Korean content, not an edge case. It would have shipped looking fine in
English and silently failed on half the corpus.

**pgroonga** is officially supported on Supabase, performs real Korean segmentation, and
indexes English in the same index — one search path, not two. `pg_bigm` and `mecab-ko`
are **not available** on managed Supabase, so pgroonga is effectively the only option
short of self-hosting Postgres.

Embeddings alone are not enough either: they under-rank named entities — place names,
people, dates — which is exactly what gets searched most here. So retrieval is **hybrid**:
pgroonga lexical + pgvector cosine, fused with **Reciprocal Rank Fusion** (score =
Σ 1/(k + rank), k≈50), following Supabase's documented pattern but substituting pgroonga
for stock `tsvector`. At this scale hybrid costs nothing in latency.

### No vector index

At 10k–100k rows an exact sequential scan over pgvector is single-digit milliseconds at
100% recall. HNSW/IVFFlat would add build and maintenance overhead on a
constantly-appended table in exchange for speed that is not needed. **Revisit past
~100k Entries**, not before.

### Privacy: commercial APIs, chosen deliberately

**Decided: option (a) — commercial APIs for both embeddings and generation.**

The alternative (self-hosting BGE-M3 so the corpus never leaves our infrastructure) was
genuinely close and was rejected on operational grounds: BGE-M3 cannot run in a Supabase
Edge Function (Deno, no GPU, multi-GB cold start), so it would require a separate
always-on sidecar box — the only piece of this app that would not be Next.js and
Supabase, and a thing that can break at 2am.

What makes this defensible rather than careless:
- Anthropic and OpenAI both **contractually exclude API data from model training by
  default**, with short retention. Use the API, never consumer plans, whose terms differ.
- Retrieval happens entirely in our own Postgres. Generation only ever sees the
  **retrieved snippets** for one question — never the full corpus.

**This is a conscious trade against *privacy by default*, recorded so it is revisitable.**
The exit is clean: swapping to self-hosted embeddings later changes how the vector column
is populated and nothing else about the model. If it ever stops feeling right — or if a
provider changes its terms — that swap is the remedy.

### Scope: Recall reads captions and metadata, never images

Recall reads every Entry: Letters, Notes, Places, Visits, Journeys, Events, and Photo
*captions and metadata*. It does **not** see photographs themselves. Vision over the
entire family album is a much larger, costlier, more invasive feature, and "find the
photo from Jeju" already works from `occurred_at` and `place_id`.

**Letters are readable, never writable** — settled in charting and binding. The chat
agent may recall what Yangcho wrote; it may never draft a letter.

### Generation and cost

Anthropic or OpenAI API over the RRF-retrieved top-k. Total realistic cost is **under
$15/month**, dominated by Supabase Pro rather than AI usage — embedding 100k Entries once
costs well under a dollar, and 100–500 queries a month run $2–10.

### Consequence for the Entry index

Entry gains an embedding column and a pgroonga index. Every section that emits Entries
gets Korean-aware search for free — but embedding generation must be wired into the write
path, which is a real obligation on section design and should be stated in the spec.
