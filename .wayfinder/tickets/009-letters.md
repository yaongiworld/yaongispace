---
id: 009
title: What is a letter, and how does writing one feel?
label: wayfinder:prototype
status: closed
assignee: session-2026-08-22-h
blocked-by: [006]
closed: 2026-08-22
---

## Question

The letters section — a space to write to each other. Emotionally the most important
section in the app, and the one most easily ruined by treating it as a messaging
feature.

- What distinguishes a letter from a chat message? Length, ceremony, permanence,
  the fact that it's composed rather than fired off. Whatever the answer, the interface
  should make writing one feel deliberate.
- Composition experience: plain text, rich text, or something with paper/stamp/seal
  texture. Prototype it — this is a feel question. **Note the Paper Diary direction was
  rejected for the app overall in favour of Soft Clay** — but letters are the one section
  where paper texture might still earn its place as a local flourish. Decide whether that
  is a welcome accent or an inconsistency.
- Type: BM Jua/Fredoka are the display faces and Pretendard the body. A handwritten face
  for letter *bodies* specifically would need to render Korean well — most do not.
- Can a letter be sealed until a date, or scheduled? (Sitting in fog; may sharpen here.)
- Are letters ever edited after sending, or immutable once sent?
- How they're read and re-read years later — this is the section most likely to matter
  in a decade, so browsing the archive deserves as much thought as writing.
- Notifications: a new letter is the highest-signal event in the whole app.

**Settled and binding**: the chat agent may *read* letters for recall, but never drafts
or writes them. The point of a letter is that you wrote it.

Blocked on look-and-feel.

---

## Resolution (2026-08-22)

Prototype: [`prototypes/letters.html`](../../prototypes/letters.html) — three phone-sized
screens (composing with suggestions, design generation, the archive) built on the real
Soft Clay tokens and Fluent assets. One decision recorded as
[ADR-0011](../../docs/adr/0011-ai-suggests-in-letters-never-writes.md).

### A letter is sealed, not sent

The word doing the work is **봉하기** (seal), not 보내기 (send). Sealing is what
distinguishes a letter from a message: it implies deliberation and a point of no return.

**Editable until read, then immutable.** A letter can be fixed while it still sits
unread; the moment the other person opens it, it locks. This keeps the seal meaningful
without making a typo permanent — the recipient never sees a letter change under them,
which is the property that actually matters.

### The paper-vs-clay question dissolved

The ticket asked whether paper texture is a welcome accent or an inconsistency, given
Paper Diary lost to Soft Clay app-wide. **Neither — the design is generated per letter**,
so both exist and the writer picks. The question stopped needing an answer rather than
getting one.

Design generates from a **mood prompt plus the letter's own text**, with a system prompt
constraining output to the app's theme. A sealed letter **keeps its design forever**,
which is what makes the archive worth scrolling years later.

### AI assists, within a bounded scope — the binding constraint amended

The ticket's binding "never drafts or writes" was **consciously amended** — see
ADR-0011 for the full reasoning. In short: **suggest-only, never auto-apply.** The app
underlines and offers; nothing changes without a tap; the suggestion count is shown so
restraint is visible. Every word in a sealed letter is still a word its writer chose.

The scope line is **errors, not voice**: conjugation mistakes are flagged, awkward-but-
correct phrasing is not. That phrasing is the writer's fingerprint and smoothing it is
exactly what the original constraint protected against.

**Cost accepted knowingly**: design generation sends letter bodies to a commercial API,
which is a *wider* exposure than [ADR-0004](../../docs/adr/0004-commercial-ai-apis-over-self-hosting.md)
authorised (it scoped generation to retrieved snippets, never whole documents).
Prompt-only was offered and declined in favour of better designs.

### Sealed until a date is real

A letter can be locked until a chosen date — an anniversary, a birthday, ten years out.
Kept as a real feature rather than mockup decoration: emotionally it is among the
strongest things in the app, and technically it is one timestamp column plus a UI gate.

### Typography

Body text in **Gaegu** (OFL, genuine Korean handwriting face) when a generated design
calls for handwriting; **Pretendard** otherwise. **Ownglyph is ruled out** regardless of
aesthetic fit — no modification or redistribution rights and a posted shutdown notice,
which fails *long-lived data*. Hi Melody is the OFL alternative if Gaegu reads poorly at
length.

### Left to implementation

**The system prompt is load-bearing and unspecified.** "Stay inside Soft Clay" must
become concrete constraints before this is built. That is a spec question, not a
decision, so it is not blocking this ticket.

---

**Added by [What language does Yaongispace speak?](015-bilingual-strategy.md)
(2026-08-22)**: generated letter designs are **decorative only and must never render
text** — paper, texture, colour, ornament, no lettering. Generated Hangul is reliably
garbled, and garbled Korean on a keepsake meant to last decades is both ugly and
embarrassing. Constrains the design-generation prompt: it must explicitly exclude text,
lettering and characters from the output.
