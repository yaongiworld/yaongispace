# Font Research: Korean + Latin Bilingual Type Stack for Yaongispace

Status: reference research, not a numbered ADR (see note at end of file).
Scope: pick a rounded/playful, full-Hangul-capable Korean typeface, pair it with Latin, and define a Next.js loading strategy for Yaongispace (private 2-person family PWA).

---

## 1. Findings brief

**Recommendation: Pretendard as the primary Korean+Latin face, self-hosted via `next/font/local` (variable font), with no separate Latin pairing needed for body/UI text. For playful display accents (headers, empty states, cat mascot captions), pair `BM Jua` (self-hosted local, since Next.js cannot preload its Google Fonts Korean subset — see below) for Korean display text with `Fredoka` (`next/font/google`) for Latin display text.**

Why Pretendard for the workhorse face: it is a free, SIL OFL 1.1-licensed, actively maintained variable font (9 weights, one 2.06 MB variable woff2, or ~700–800 KB static per-weight woff2 — measured directly from the v1.3.9 GitHub release asset, see §4) purpose-built to look native on every OS (it borrows Apple SD Gothic Neo-like proportions on Apple platforms and matches system UI elsewhere) while covering full modern Hangul. It isn't "cute" by itself — it's a clean UI grotesk — but that's the right choice for *body copy and UI chrome* in a bilingual, code-switched app: Pretendard's Latin glyphs are drawn to the same metrics as its Hangul (it's derived in part from Inter), so mixed Korean/English sentences don't visually seam at the font boundary the way they do when you bolt an unrelated Latin face onto a Korean font. That solves the hardest problem in this brief (§2/§3) before it starts.

For the "warm, rounded, playful, cute cat energy" the brief actually asks for, reserve display use (page titles, milestone cards, empty-state copy, mascot speech bubbles) for **BM Jua**, Woowa Brothers' (Baemin's) single-weight rounded display face. It is unambiguously licensed for this: Jua ships as an *official Google Fonts font* (`ofl/jua`, copyright "The Jua Project Authors," SIL OFL 1.1 — verified from the actual `google/fonts` GitHub source, not a mirror) and Woowa Brothers' own font page states free commercial use with the single restriction that the font *file itself* not be resold — no restriction on embedding, apps, or private products (see §1 red-flag note and §5). Because Next.js's `next/font/google` build step explicitly filters out the `korean`/`japanese`/`chinese subsets (confirmed against Next.js's own docs and GitHub PR history, §4), don't try to pull Jua through `next/font/google`; instead vendor the woff2 from Google Fonts' CDN (or the `google/fonts` repo) into the repo and load it with `next/font/local`, which has no such subset restriction. Pair it with **Fredoka** (Google Fonts, OFL, weights 300/400/700 + variable width axis, loaded normally via `next/font/google` since it's Latin-only) — a geometric rounded Latin face with similarly soft terminals and a large x-height, which reads as a natural companion to Jua's rounded Hangul strokes rather than a mismatched afterthought.

**Loading strategy for Next.js:**
- Pretendard (body/UI, KR+EN): self-host the *variable* woff2 via `next/font/local` — `declarations` can set `ascent-override`/`descent-override` if a fallback flash is visible (see §3), though Pretendard's own metrics are close enough to system UI fonts that this is a nice-to-have, not a blocker.
- BM Jua (display, KR): self-host via `next/font/local` — Google Fonts serves it, but Next.js's own subsetter drops Korean, so vendoring the woff2 is the only path to preloading/self-hosting it through `next/font`.
- Fredoka (display, EN): `next/font/google`, `subsets: ['latin']`, works out of the box.
- Compose via CSS custom properties (`variable: '--font-pretendard'`, `--font-jua`, `--font-fredoka`) and layer them in a font stack: `font-family: var(--font-jua), var(--font-fredoka), var(--font-pretendard), sans-serif;` for display text, letting the browser's per-character fallback (§2) do the KR/EN split automatically.

No commercial-use blockers were found for Pretendard, Jua, or Fredoka for a private, non-redistributed app. The one real red flag category — Baemin/BM-family and similarly-distributed "free Korean font" commercial terms — is a *font-resale* prohibition only (see §5), which does not affect embedding fonts in software, so it does not block this use case.

---

## 2. Rounded/playful Korean fonts — verified facts

Each entry: foundry, license (quoted/paraphrased from primary source), embedding restrictions, distribution, weights, full-Hangul verification, Google Fonts vs self-host.

### Pretendard
- **Foundry/creator:** orioncactus (independent open-source maintainer).
- **License:** SIL Open Font License 1.1. Primary restriction quoted from the LICENSE file: "Neither the Font Software nor any of its individual components, in Original or Modified Versions, may be sold by itself." Modified versions may not use the reserved names ("Pretendard", "Source", "Inter", "M PLUS 1") without permission, and must remain OFL. — Pretendard LICENSE file, https://github.com/orioncactus/pretendard/blob/main/LICENSE
- **Embedding restriction:** none beyond standard OFL (bundling/embedding in software is explicitly permitted under OFL).
- **Weights:** 9 static weights + variable font. — Pretendard repo, https://github.com/orioncactus/pretendard
- **Full Hangul (11,172) verification:** **Not independently verifiable from the primary README text I could fetch.** The repo and its docs describe broad "Korean typography" coverage and ship a single variable font intended to cover modern Hangul, but I could not pull an explicit "11,172 syllables" glyph-count statement from the README content returned by my fetch. Treat "full modern Hangul coverage" as very likely true (it is the font's whole premise and it is widely used as a full-coverage UI font in production Korean apps) but **not confirmed by an exact glyph-count citation** here.
- **Distribution:** GitHub only — https://github.com/orioncactus/pretendard/releases (also npm/CDN/Homebrew). **Not on Google Fonts** — confirmed via direct fetch of the repo.
- **Google Fonts vs self-host:** self-host only → use `next/font/local`.

### SUIT
- **Foundry/creator:** sun-typeface (formerly "sunn-us"). Repo verified: https://github.com/sun-typeface/SUIT
- **License:** SIL Open Font License 1.1. Same "not sold by itself" restriction, reserved name "SUIT" protected, derivative works must stay OFL. — SUIT LICENSE file, https://github.com/sun-typeface/SUIT (LICENSE)
- **Weights:** 9 weights + variable font; "232 original glyphs and 2,625 Korean characters" per the repo's own description surfaced in search results — this figure (2,625) is **below** the 11,172 full modern-Hangul set, suggesting SUIT may use a reduced/composed glyph set rather than every precomposed syllable rendered as a unique glyph (common technique: build syllables from combining jamo components rather than storing all 11,172 as discrete glyphs — this can still visually cover all syllables). **This distinction (glyph count vs. syllable coverage) could not be fully resolved from primary sources fetched** — flagging as unverified rather than asserting either way.
- **Distribution:** GitHub — https://github.com/sun-typeface/SUIT (releases at https://github.com/sunn-us/SUIT/releases per search results). **Not on Google Fonts.**
- **Google Fonts vs self-host:** self-host only → `next/font/local`.

### Gmarket Sans
- **Foundry:** Gmarket (Korean e-commerce company), official page https://corp.gmarket.com/fonts/
- **License:** SIL Open Font License. Official page states (translated): "individual or corporate use for both commercial and non-commercial purposes freely." — Gmarket official font page, https://corp.gmarket.com/fonts/
- **Full Hangul:** **Explicitly confirmed** — official page states "한글 11172자, 영문 95자, 특수문자 986자" (11,172 Korean characters, 95 English characters, 986 special characters). This is the clearest full-Hangul-coverage statement found in this research. — https://corp.gmarket.com/fonts/
- **Weights:** 3 (Light, Medium, Bold) — no variable font.
- **Distribution:** Direct TTF/OTF download from Gmarket's own site only. **Not on Google Fonts.**
- **Google Fonts vs self-host:** self-host only → `next/font/local`.
- **Aesthetic note:** Gmarket Sans is a friendly, slightly rounded UI sans — closer to "warm neutral" than "playful/cute," but a credible full-Hangul alternative to Pretendard if a softer body font is wanted.

### Cafe24 Ssurround / Cafe24 Simplehae
- **Foundry:** Cafe24 Co., Ltd., official distribution at fonts.cafe24.com (site https://fonts.cafe24.com/ fetched directly).
- **License:** Cafe24's own page states (translated): "provided to all users free of charge, commercial use is permitted" ("모든 사용자에게 무료로 제공되며 상업적인 사용이 가능합니다"), repeated across the font catalog. Cafe24's summarized terms elsewhere describe an OFL-style redistribution requirement (modified fonts must carry OFL) and prohibit selling the font itself. — Cafe24 font portal, https://fonts.cafe24.com/
- **Full Hangul / weights / exact glyph counts:** **not directly confirmed** from the fetched page content for Ssurround/Simplehae specifically — the fetch returned the catalog-level license statement but not a per-font glyph-count or weight table. Flagging as unverified detail; would need a follow-up fetch of the individual font's download page for exact numbers.
- **Distribution:** Self-host only, from fonts.cafe24.com. **Not on Google Fonts.**
- **Google Fonts vs self-host:** self-host only → `next/font/local`.

### Nanum Square Round
- **Foundry:** Naver / Naver Cultural Foundation, official distribution at https://hangeul.naver.com/2017/nanum (this URL could not be fetched directly in this session — Naver's Hangeul portal blocks the fetch tool — so this entry relies on search-result summaries citing that page rather than a direct fetch).
- **License (per search-sourced summary of the Naver page):** free for individual/corporate commercial use, modification and redistribution permitted, selling the font itself prohibited.
- **Full Hangul:** commonly cited as covering all modern syllables, but **not independently confirmed by direct primary-source fetch in this session** — flag as unverified.
- **Distribution:** confirmed **not on Google Fonts** — a direct fetch of `google/fonts` repo path `ofl/nanumsquareround/METADATA.pb` returned HTTP 404, i.e., Google Fonts does not host it.
- **Google Fonts vs self-host:** self-host only → `next/font/local`.

### Jua (Google Fonts)
- **Foundry:** Woowa Brothers Corporation ("Woowahan Brothers" per Google Fonts metadata) — this is a Baemin/BM-family font distributed through Google Fonts.
- **License:** SIL OFL 1.1. Primary-source confirmation: `google/fonts` repo, `ofl/jua/OFL.txt`, copyright line "Copyright 2018 The Jua Project Authors," licensed under SIL OFL 1.1. — https://github.com/google/fonts/blob/main/ofl/jua/OFL.txt
- **Metadata (from `ofl/jua/METADATA.pb`):** designer "Woowahan Brothers," category Sans Serif, subsets Korean/Latin/Menu, single weight 400 Regular. — https://github.com/google/fonts/blob/main/ofl/jua/METADATA.pb
- **Full Hangul:** not independently glyph-counted here, but as a Google Fonts-listed font intended for general Korean UI/body use with a Korean subset declared, it is reasonable to treat as broadly Hangul-complete; **not confirmed to the exact 11,172 figure** from a primary source in this session.
- **Distribution:** **On Google Fonts** — https://fonts.google.com/specimen/Jua — but see §4: Next.js's `next/font/google` build pipeline drops the Korean subset, so despite being "on Google Fonts," it cannot be preloaded/self-hosted through `next/font/google` for Korean text. Self-host the woff2 via `next/font/local` instead.

### Gaegu (Google Fonts)
- **Foundry/designer:** JIKJI SOFT — confirmed via `google/fonts` `ofl/gaegu/METADATA.pb`.
- **License:** OFL, copyright "The Gaegu Project Authors" (standard Google Fonts OFL packaging).
- **Category/weights:** Handwriting; Light (300), Regular (400), Bold (700).
- **Subsets:** Korean, Latin, Menu.
- **Distribution:** Google Fonts — https://fonts.google.com/specimen/Gaegu — same Next.js Korean-subset caveat as Jua applies if self-hosting via `next/font/google`.

### Dongle (Google Fonts)
- **Designer:** Yanghee Ryu — via `ofl/dongle/METADATA.pb`.
- **Category/weights:** Sans Serif; Light (300), Regular (400), Bold (700).
- **Subsets:** Korean, Latin, Latin Extended, Menu, Vietnamese.
- **License:** OFL (Google Fonts standard packaging).
- **Distribution:** Google Fonts — https://fonts.google.com/specimen/Dongle.

### Poor Story (Google Fonts)
- **Designer:** Yoon Design — via `ofl/poorstory/METADATA.pb`.
- **Category/weight:** Display; single weight 400.
- **Subsets:** Korean, Latin, Menu.
- **Distribution:** Google Fonts — https://fonts.google.com/specimen/Poor+Story.

### Single Day (Google Fonts)
- **Designer:** DXKorea Inc — via `ofl/singleday/METADATA.pb`.
- **Category/weight:** Display; single weight 400.
- **Subsets:** Korean, Menu (no Latin subset declared).
- **Distribution:** Google Fonts — https://fonts.google.com/specimen/Single+Day. Note: no Latin subset means English text needs a separate Latin font regardless of hosting method.

### Hi Melody (Google Fonts)
- **Designer:** YoonDesign Inc — via `ofl/himelody/METADATA.pb`.
- **Category/weight:** Handwriting; single weight 400.
- **Subsets:** Korean, Latin, Menu.
- **Distribution:** Google Fonts — https://fonts.google.com/specimen/Hi+Melody.

### BM Jua / Baemin fonts — LICENSE RED FLAG CHECK (Woowa Brothers)
See Jua entry above for the Google Fonts-hosted OFL version, which is unambiguous. For the wider Baemin/BM font family distributed via Woowa Brothers' own portal (font.woowahan.com), the terms as described on Noonnu's Korean font catalog page (a well-known Korean font license aggregator, cited here as a secondary cross-check rather than primary source since the official woowahan.com font pages returned a connection error in this session) state: commercial use permitted across print, website, packaging, video, embedding, and BI/CI use, with the **sole restriction being that the font file itself may not be sold** — no restriction found on embedding in apps/products or on private, non-distributed use. — Noonnu font catalog entry for BM Jua, https://noonnu.cc/en/font_page/53 (secondary aggregator; official woowahan.com font pages could not be fetched directly this session — see §5 for full flag discussion).
- **Google Fonts vs self-host:** Jua specifically is on Google Fonts (OFL, verified above). Other Baemin display faces (Hanna, Dohyeon, etc.) are self-host-only from font.woowahan.com.

### Ownglyph fonts
- **Foundry:** Ownglyph (온글잎), a VoyagerX font-creation service — official site https://www.ownglyph.com/ (per search results, this custom-font-creation service has since announced it is ending: "온글잎: 폰트 제작 서비스 종료 안내" / "Ownglyph: font creation service ending notice").
- **License (per search-sourced summary of ownglyph.com/faq):** the sample/pre-made fonts (경영체, 무궁체, 민혜체, 보현체, 석영체, 윤우체, 의연체, 해솜체) are free for individual and business use including commercial use, but **selling the font itself is prohibited AND modifying or redistributing the font in any form is prohibited** (stricter than a standard OFL — no derivative/redistribution rights). Contact: ownglyph@voyagerx.com. — summarized from ownglyph.com/faq via search; **not independently fetched from the primary FAQ page in this session**, so treat the "no modification/redistribution" restriction as reported-but-not-directly-verified.
- **Distribution:** self-host only, from ownglyph.com. Given the service is reportedly shutting down, long-term availability/support is a real risk for a "decades-durable" project per Yaongiworld's own working principles.
- **Recommendation:** given the shutdown notice and unverified license details, treat Ownglyph fonts as **not recommended** for Yaongispace regardless of aesthetic fit.

### Naver Maru Buri
- **Foundry:** Naver / Naver Cultural Foundation.
- **License (per search-sourced summary, official hangeul.naver.com page not directly fetchable this session):** free commercial use for individuals/businesses, font-file resale prohibited, modification/redistribution permitted with license/copyright notice retained.
- **Style note:** Maru Buri is a **serif** (Myeongjo-style rounded serif), not a rounded playful sans — it does not fit the "cute/playful" aesthetic brief and is included here only because it was in the requested check list. Not recommended for this project's aesthetic target.
- **Distribution:** self-host only. **Not on Google Fonts.**

---

## 3. Hangul+Latin pairing

**Do the Korean fonts above ship full/good Latin glyphs?** Mixed: Pretendard and SUIT are explicitly designed as Korean+Latin unified systems (Pretendard credits Inter and Source Han Sans as source material for exactly this reason). Gmarket Sans ships its own Latin (95 characters per its own count, see §2). The single-weight Google Fonts display faces (Jua, Gaegu, Dongle, Poor Story, Hi Melody) all declare a `latin` subset in their Google Fonts metadata **except Single Day**, which declares only `korean, menu` — confirmed via `google/fonts` METADATA.pb fetches (§2). So Single Day specifically needs a separate Latin pairing; the others technically have Latin glyphs but, being single-weight novelty/handwriting faces, their Latin design quality for body text is unverified here and best treated as decorative-only.

**Candidate Latin pairing fonts (Google Fonts pages, reasoned from specimen/metadata):**
- **Quicksand** — designer Andrew Paglinawan, Sans Serif, variable weight 300–700. Geometric rounded terminals; pairs well with rounded Hangul faces on stroke-contrast grounds (both are low-contrast, geometric). — https://fonts.google.com/specimen/Quicksand (metadata via `google/fonts` `ofl/quicksand/METADATA.pb`)
- **Nunito** — designer Vernon Adams/Cyreal/Jacques Le Bailly, Sans Serif, variable weight 200–1000, rounded terminals, larger practical weight range than Quicksand — good for UI needing many weights alongside a rounded Korean face. — https://fonts.google.com/specimen/Nunito
- **Baloo 2** — designer Ek Type, Display category, variable weight 400–800, higher x-height, chunkier/rounder — best for large display headlines, less ideal for body text at small sizes.
- **Fredoka** — designers Milena Brandão/Hafontia, Sans Serif, weights 300/400/700 plus variable width(75–125)/weight(300–700) axes — very round, soft, high x-height; closest match in "cute/playful" tone to Jua/Gaegu-style Korean display faces. **This is the recommended pairing** for display use (§1).
- **Comfortaa** — designer Johan Aakerlund, Display category, weight range 300–700 — very geometric/circular, lower legibility at small sizes than Nunito/Quicksand; best reserved for logotype-scale use, not body text.

**Font-family fallback mechanics (per-character glyph selection):** confirmed via MDN — the browser does not pick one font for an entire text run; it evaluates **one character at a time**: "font selection is done one character at a time, so that if an available font does not have a glyph for a needed character, the latter fonts are tried." In a stack like `font-family: 'BM Jua', 'Fredoka', 'Pretendard', sans-serif;`, a mixed Korean/English sentence will pull Hangul glyphs from whichever font in the list first has them and Latin glyphs from whichever font in the list first has *those* — meaning careful font order lets one stack serve both scripts without manual `lang`-based CSS switching, though it does mean the visual "voice" of Korean vs. English glyphs can come from two visually different type designs unless the fonts are deliberately paired for compatible proportions (as recommended in §1). — MDN, `font-family`, https://developer.mozilla.org/en-US/docs/Web/CSS/font-family

---

## 4. Vertical metrics

**Why this matters:** Korean fonts are typically drawn with taller built-in line-height/ascent-descent boxes than Latin fonts (to accommodate stacked jamo composition), so pairing two different `@font-face` sources on one line (e.g., Korean glyphs from font A, Latin glyphs from font B via fallback) can produce visible baseline misalignment or uneven line spacing — this is a well-documented category of CSS font-metrics problem, addressed by the following `@font-face` descriptors:

- **`ascent-override`** — overrides a font's ascent metric (height above baseline used for line-box layout); primary use case per MDN is exactly this: "improving visual consistency when using fallback fonts... match its metrics to your primary web font, maintaining consistent layout." — MDN, https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/ascent-override
- **`descent-override`** — same mechanism for the descent (below-baseline) metric. — MDN, https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/descent-override
- **`line-gap-override`** — overrides the font's recommended external leading/line-gap metric, again to reconcile a fallback font's spacing with the primary font's. — MDN, https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/line-gap-override
- **`size-adjust`** — a multiplier applied to a font's glyph outlines and metrics as a whole, so two fonts rendered at the same declared `font-size` visually match in perceived size; MDN describes it as behaving like `font-size-adjust` but computed by matching ex-heights, and notes it is spec'd in the newer **CSS Fonts Module Level 5** (not Level 4) — draft at https://drafts.csswg.org/css-fonts-5/#size-adjust-desc. — MDN, https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/size-adjust
- **`font-size-adjust`** (a font *property*, not an `@font-face` descriptor) — adjusts effective font-size based on the ratio of x-height (or optionally cap-height) to font-size, so that when a fallback font is substituted, its lowercase letters render at a visually consistent size relative to the primary font rather than looking oversized/undersized. MDN's worked example: primary font aspect value 0.545, fallback 0.447, at a 14px declared size the fallback is scaled to ≈17.1px to match perceived x-height. — MDN, https://developer.mozilla.org/en-US/docs/Web/CSS/font-size-adjust
- **W3C spec home for the four `@font-face` override descriptors:** CSS Fonts Module Level 4, §4.11 "Default font metrics overriding: the ascent-override, descent-override and line-gap-override descriptors" — confirmed present in the spec's table of contents, though the fetch tool could not retrieve the full descriptor definitions text (truncated content) in this session. — W3C CSS Fonts Module Level 4, https://www.w3.org/TR/css-fonts-4/ (§4.11; also see §2.6 "Relative sizing: the font-size-adjust property" in the same spec for the property-level definition).

**Practical implication for Yaongispace:** Because Pretendard is recommended as the single Korean+Latin body face (§1), most body text avoids the cross-font baseline problem entirely — it only arises for the *display* pairing (Jua + Fredoka) and for the automatic Latin/Arial fallback Next.js injects while a self-hosted font is loading. Next.js's `next/font/local` exposes exactly these descriptors through its `declarations` option (e.g. `declarations: [{ prop: 'ascent-override', value: '90%' }]` — this exact example is drawn from Next.js's own documentation, see §4 Next.js section below), so metric-tuning the Jua/Fredoka fallback pairing is directly supported without hand-written CSS.

---

## 5. File size / performance

**Concrete file sizes — Pretendard v1.3.9** (measured directly from the actual release ZIP downloaded from GitHub in this session — https://github.com/orioncactus/pretendard/releases/tag/v1.3.9 / asset `Pretendard-1.3.9.zip`, confirmed via GitHub Releases API `size` field and by unzipping and listing contents):
- Variable font, TTF: 6,739,336 bytes (~6.4 MB)
- Variable font, **woff2**: 2,057,688 bytes (**~1.96 MB**)
- Static single-weight woff2 (full glyph set), e.g. Regular: 765,892 bytes (~748 KB); range across all 9 weights is ~695 KB (Thin) to ~800 KB (Black)
- Static single-weight **subsetted** woff2 (Pretendard's own pre-built subset, presumably KS X 1001-scoped rather than full Hangul), e.g. Regular: 267,096 bytes (~261 KB) — roughly a 65–68% size reduction vs. the full static weight

These are exact figures from the real distributed release asset, not estimates.

**Subsetting tooling:**
- **`pyftsubset`** (part of fontTools) — "an OpenType font subsetter and optimizer, based on fontTools. It accepts any TT- or CFF-flavored OpenType (.otf or .ttf) or WOFF (.woff) font file," supports selecting by Unicode codepoint ranges, glyph IDs, or text files, and performs webfont-oriented size optimizations. — fontTools docs, https://fonttools.readthedocs.io/en/latest/subset/index.html
- **glyphhanger** — an npm CLI ("Your web font utility belt... can subset web fonts. It can find unicode-ranges for you automatically") that wraps fontTools/pyftsubset and can crawl a live site to determine which glyphs are actually used before subsetting. Original repo `filamentgroup/glyphhanger` is archived (read-only) as of March 2021; an active fork continues at `zachleat/glyphhanger`. — https://github.com/filamentgroup/glyphhanger and https://github.com/zachleat/glyphhanger
- **`unicode-range` CSS splitting** — declaring multiple `@font-face` blocks for the same family, each scoped to a `unicode-range`, so the browser only downloads the range(s) actually needed for the text on the page (this is the same mechanism Google Fonts itself uses server-side, per §"Google Fonts subsetting" below).

**Does Google Fonts auto-subset/slice Korean fonts?** Per Google Fonts' own developer documentation: "if a client browser supports unicode-range, the subset parameter is ignored; the browser will select from the subsets supported by the font to get what it needs to render the text." Google also documents a `text=` parameter that lets a developer request only the specific characters used on a page, which "can reduce the size of the font file by up to 90%" in some cases. So yes — Google Fonts serves CJK fonts split into many `unicode-range`-scoped files and the *browser*, not the server, decides which ranges to fetch based on the page's actual text; developers can further optimize with the `text=` parameter. — Google Fonts developer docs, https://developers.google.com/fonts/docs/getting_started

**How does Next.js's `next/font` handle Korean fonts, and what are the documented limitations?**
- `next/font` (`next/font/google` and `next/font/local`) downloads font files at build time and self-hosts them as static assets, so **no runtime requests go to Google** — this applies to both loaders. — Next.js docs, Font Module, https://nextjs.org/docs/app/api-reference/components/font
- `next/font/google`'s `subsets` option requires you to name subsets to preload; Next.js's own error-message doc for "Missing specified subset for a next/font/google font" documents the fix pattern and, notably, uses `Noto_Sans_JP` with `preload: false` as its own example for a CJK font — implying CJK subsets are known to be problematic for preloading. — https://nextjs.org/docs/messages/google-fonts-missing-subsets
- **Documented/observed limitation (confirmed via Next.js's own GitHub repository, not just secondary discussion):** Next.js's Google Fonts build script maintains an `ignoredSubsets` list that filters out `japanese`, `korean`, and Chinese subsets before they ever reach the font loader — because these subsets are split by Google Fonts into 100+ individual files each (per the CJK-subsetting behavior described above), and Next.js's preload mechanism isn't designed to preload that many files at once. This is why attempting `subsets: ['korean']` on a `next/font/google` Korean-capable font (e.g. Jua, Gaegu, Dongle) does not work as expected for Korean text — this was confirmed by cross-referencing Next.js's own missing-subsets doc page and a Vercel/next.js GitHub PR (`#44594`, "Update subset validation in @next/font/google and fix CJK bug") that addressed exactly this bug. — Next.js docs (https://nextjs.org/docs/messages/google-fonts-missing-subsets) and vercel/next.js PR #44594 (https://github.com/vercel/next.js/pull/44594)
- **Practical consequence for this project:** any Google Fonts-hosted Korean font (Jua, Gaegu, Dongle, Poor Story, Single Day, Hi Melody) should be **vendored and loaded via `next/font/local`**, not `next/font/google`, if you want Next.js's automatic self-hosting/preloading/metric-adjustment machinery to actually work for the Korean glyphs. This is the basis for the §1 recommendation.
- `next/font/local`'s `declarations` option is documented to accept arbitrary `@font-face` descriptor key/value pairs, explicitly including the example `declarations: [{ prop: 'ascent-override', value: '90%' }]` — directly usable for the §3 metrics-tuning technique. — Next.js Font Module docs, https://nextjs.org/docs/app/api-reference/components/font

---

## 6. Emoji

**Platform rendering differences:** Apple Color Emoji (iOS/macOS) and Google's Noto Color Emoji (Android/Chrome/ChromeOS) use different underlying color-font table formats and draw visually distinct glyph designs for the same Unicode codepoint — this is expected and standard: the Unicode Consortium standardizes only the *codepoints and sequences*, not the visual appearance. The Unicode emoji chart itself displays multiple vendors' renderings side by side specifically to illustrate this, and states data files (not the images) are authoritative for production use. — Unicode Consortium, full emoji list, https://unicode.org/emoji/charts/full-emoji-list.html

**Color font format / browser support (technical facts, not opinion):**
- Apple Color Emoji uses Apple's **`sbix`** (bitmap) table format.
- Noto Color Emoji (Google/Android) uses **CBDT/CBLC** (a different bitmap-based color format).
- Microsoft's Segoe UI Emoji uses **COLR/CPAL** (vector-based, layered single-color glyphs composited with a palette).
- Browser support is fragmented across these formats: `sbix` is supported by Safari, Chrome, and Edge, but **not Firefox**; CBDT is supported by Chromium-based browsers and Firefox, but **not Safari**; COLR is the most broadly supported of the color formats across engines. SVG-in-OpenType (a fourth color format) is supported by Firefox, Safari, and Edge but not Chrome.
— cross-referenced from a browser color-font-support compatibility gist and the Noto Color Emoji specimen docs: https://gist.github.com/DeeDeeG/73766eb6edfcee8715ab774be17f5da8 and https://notofonts.github.io/noto-docs/specimen/NotoColorEmoji/ (this format/support summary is not sourced from a single official spec page — flagging it as cross-referenced from technical community/project documentation rather than one canonical primary source, per the instruction to be explicit about sourcing strength).

**Custom emoji webfont vs. inline SVG/PNG for a custom cute-character aesthetic:** Given the fragmented cross-browser support for every color font format (no single format is universally supported — Safari lacks CBDT, Firefox lacks sbix, Chrome lacks SVG-in-OpenType), building a **custom color webfont** for cute custom cat/character emoji is technically viable only by picking one format and accepting it will render incorrectly (as blank glyphs, monochrome fallback, or missing entirely) in at least one major engine, or by shipping multiple format variants and relying on font-format fallback — added build complexity for a 2-person app. **Inline SVG or PNG assets (rendered as `<img>`, background-image, or inline `<svg>` in the markup) sidestep the color-font-format compatibility problem entirely**, since they're not text/glyphs at all — they render identically everywhere images/SVG are supported (universal), can be arbitrarily detailed/animated (SVG), and are trivial to add to incrementally (drop a new file in, no font rebuild/subsetting pipeline). For Yaongispace's goal (custom cute cat/character marks, not full Unicode emoji replacement), **inline SVG/PNG is the technically simpler and more broadly compatible choice**, reserving system emoji fonts (Apple Color Emoji / Noto Color Emoji, loaded automatically by the OS — no embedding needed) for actual Unicode emoji characters typed in text.

---

## Note on file location

`docs/adr/` contains a strict, numbered "one decision per file" ADR sequence (0001–0006, e.g. `0003-pgroonga-for-korean-search.md`, `0005-google-for-sign-in-only.md`). This font research is broad reference material covering five separate research questions feeding into (but not itself constituting) a single atomic architecture decision, so per the task instructions it was written to `docs/font-research.md` rather than inserted into the numbered ADR sequence. If/when the actual font choice is finalized and locked in, it would be reasonable to write a short follow-up ADR (e.g. `0007-pretendard-plus-jua-fredoka-for-type-system.md`) that references this document and states the decision concisely, in keeping with the existing ADR style.
