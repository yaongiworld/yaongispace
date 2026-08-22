# In letters, AI suggests and decorates — it never writes

[Ticket 009](../../.wayfinder/tickets/009-letters.md) recorded as **settled and binding**
that the agent "may read letters for recall, but never drafts or writes them. The point
of a letter is that you wrote it."

That constraint was **amended, consciously, in session 2026-08-22-h**, and a future
reader deserves to know it was reversed on purpose rather than forgotten.

## What changed and what did not

The user asked for in-app writing assistance scoped to: *do not rewrite; keep the
writer's tone, manner and most of the content; only fix unnatural wording.*

The amendment that makes this compatible with the original intent is **suggest-only,
never auto-apply**:

- The app underlines a phrase and offers an alternative.
- Nothing changes unless the writer taps 고치기. 그대로 두기 is always present and equal.
- The number of suggestions is shown, so restraint is visible rather than trusted.

Every word in a sealed letter is therefore still a word the writer chose. The original
principle — *you wrote it* — survives intact; what changed is that the app may now point.

## Errors, not voice

The line for "unnatural wording" is **grammatical error, not style**. A conjugation
mistake is flagged. Awkward-but-correct phrasing is **not** — that is the writer's
fingerprint, and smoothing it is precisely what the original constraint was protecting.
A love letter between two Korean speakers is the last place an app should be enforcing
register.

This line is the whole safety of the feature. If it drifts toward "improve this
sentence", the feature has become the thing that was ruled out.

## Design generation, and the privacy cost

A letter's visual design is generated from a **mood prompt plus the letter's own text**,
constrained by a system prompt that keeps output inside Soft Clay. This dissolved the
ticket's paper-vs-clay question: both exist, generated per letter, and the writer picks.

**This sends letter bodies to a commercial API.**
[ADR-0004](0004-commercial-ai-apis-over-self-hosting.md) already accepted commercial APIs
for recall, but it explicitly narrowed generation to "the retrieved snippets for a single
question, never the whole archive." Sending a whole letter to choose its stationery is a
**wider exposure than that ADR authorised**, so it is recorded here as an extension of
that trade rather than an application of it.

Accepted knowingly. The alternative — sending only the mood prompt — was offered and
declined in favour of better designs. The exit stays cheap: prompt-only degrades the
design and changes nothing else.

## Consequences

Letters remain the only section where the agent's *writing* is forbidden, and that
prohibition is now precisely bounded rather than absolute: **point, yes; write, no;
decorate, yes.**

Because the design is generated per letter and frozen at sealing, the archive becomes
visibly varied — the reason it is worth scrolling in ten years.

The system prompt is now load-bearing and unspecified. "Stay inside Soft Clay" must
become concrete constraints before this is built; that is a spec question, not a
decision, and is left to implementation.
