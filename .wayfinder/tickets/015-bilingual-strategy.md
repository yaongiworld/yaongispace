---
id: 015
title: What language does Yaongispace speak?
label: wayfinder:grilling
status: closed
assignee: session-2026-08-22-m
blocked-by: []
closed: 2026-08-22
---

## Question

Graduated from fog by the KB research, which established that *content* search is
Korean-capable via pgroonga. That settles retrieval but says nothing about the interface,
and the two are separate questions.

- **UI language**: Korean-first, English-first, or switchable? The workspace principle is
  *bilingual where it matters — don't default to English-only*. Both of you are Korean
  speakers, and this is a home, not a product.
- **Mixed content is the normal case.** A letter may be Korean, its title English, a note
  code-switched mid-sentence. The UI must never assume one language per user or per
  entry.
- **Typography**: Korean and Latin need different line-height and letter-spacing to look
  right together, and font choice is constrained by what renders Hangul well. This lands
  directly on the look-and-feel work — a font picked for Latin alone will look wrong.
- **Dates and formatting**: Korean convention (2026년 8월 22일) vs. Western, and which
  reads better on the timeline and in Recall answers.
- **Does Recall answer in the language of the question?** A Korean question about an
  English letter — which language does the answer come back in?
- **Names**: Towee/Tony/태욱, Yangcho/Gee Eun/지은. Which appear in the UI, and does it
  differ per language?

Feeds look-and-feel (typography) and the eventual Recall prompt design.

## Resolution (2026-08-22)

**Yaongispace speaks Korean, and nothing in the data model knows what a language is.**
Six questions put to the user and accepted.

### Korean-first, no switcher

UI chrome — labels, buttons, empty states — is **Korean, hardcoded**. No language toggle,
no message catalogs, no locale context, no i18n indirection.

A switcher is infrastructure built for a user who does not exist. Both of you are Korean
speakers and this is a home, not a product; the workspace principle is *bilingual where it
matters — don't default to English-only*, and here what matters is Korean.

The one force pulling the other way is the **MBA portfolio** — the app may be shown
publicly once the commissioned yaongi lands. It does not change the answer: a Korean UI
reads as a real thing built for real people rather than a demo, and a screenshot with a
caption explains it. Building i18n scaffolding for a hypothetical English reader would be
the over-engineering the root `CLAUDE.md` warns against.

### No language field, anywhere

Content is **just text**. No `language` column on Entry, Letter, Note or Person; the UI
never assumes one language per person or per entry.

Mixed content is the normal case — a Korean letter with an English title, a note that
code-switches mid-sentence. This lands hardest on **search**: pgroonga segments Korean
([ADR-0003](../../docs/adr/0003-korean-aware-search.md)) and a code-switched
sentence needs both languages handled in one field. Tagging an Entry `ko` or `en` would be
wrong for most real content and would tempt a later session to filter or branch on it.

The only place language is decided is **Recall's answer**, per question, at runtime —
never stored.

### Korean date convention, relative for the recent past

**"2026년 8월 22일"** in the timeline and on an Entry; **"3일 전"** on the News line and
anywhere recency is the point. Times in `Asia/Seoul`, already the convention from
[the calendar research](002-google-calendar-sync.md). Korean date order (year→month→day)
also scans naturally down a vertical timeline.

### The yaongi names, in Korean

**토위 (Towee)** and **양초 (Yangcho)** — what you actually call each other. Legal names
(Tae Wook Kang, Gee Eun Woo) belong on documents, not in a home. Consistent with the
Korean UI.

**Person stays thin** — this is one display-name field, not a name-per-language structure.

### Recall answers in the question's language; quotes stay verbatim

Two rules, and the pairing is the point:

1. Recall answers **in the language of the question**. A Korean question gets a Korean
   answer, even about an English letter.
2. **Quoted sources are never translated.** They appear in their original language,
   untouched.

Recall always shows its sources and prefers to under-claim
([ticket 004](004-knowledge-base-architecture.md)). Translating a quoted letter would
silently put words in your spouse's mouth — exactly the failure the "search box that
speaks, not a companion" framing exists to prevent. Prose may be translated; evidence may
not.

### Generated letter designs must never render text

Letter designs are generated per letter from a mood prompt plus the letter's own text
([ticket 009](009-letters.md)). They are **decorative only** — paper, texture, colour,
ornament — and must **never contain lettering**.

Recorded here because it is a language decision wearing design clothes: generated Hangul
is reliably garbled, and garbled Korean on a keepsake meant to last decades is both ugly
and embarrassing. The mascot commission is unaffected — a cat has no language.
