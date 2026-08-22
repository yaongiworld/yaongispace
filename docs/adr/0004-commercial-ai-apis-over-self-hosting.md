# Commercial AI APIs, chosen deliberately over self-hosting

Recall sends the most intimate content in the app — love letters — to a model provider.
We considered self-hosting embeddings (BGE-M3) so that the corpus never leaves our own
infrastructure, and rejected it on operational grounds: BGE-M3 cannot run in a Supabase
Edge Function, so it would need a separate always-on sidecar service. That would be the
only component of this app that is not Next.js and Supabase, and one more thing that can
break at 2am for two people who just want to read old letters.

We use commercial APIs for both embeddings and generation.

## Why this is defensible

Anthropic and OpenAI both contractually exclude API data from model training by default,
with short retention — the **API specifically**, not consumer plans, whose terms differ.
Retrieval runs entirely in our own Postgres, so generation only ever sees the retrieved
snippets for a single question, never the whole archive.

## Consequences

This is a conscious trade against the *privacy by default* principle, recorded here so
it stays revisitable rather than becoming an unexamined default. The exit is cheap:
moving to self-hosted embeddings later changes only how the vector column is populated,
nothing else in the model. If a provider changes its terms, that swap is the remedy.
