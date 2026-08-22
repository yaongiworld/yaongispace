---
id: 004
title: How does the chat agent know our life?
label: wayfinder:grilling
status: open
assignee:
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
