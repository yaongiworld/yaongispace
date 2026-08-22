# Korean fonts are self-hosted via next/font/local

A future reader will see Korean fonts loaded through `next/font/local` while Latin faces
come from `next/font/google`, assume the inconsistency is an oversight, and "fix" it.

It is not an oversight. **Next.js's build pipeline filters CJK subsets out of
`next/font/google`** (Next.js font docs; PR #44594). A Korean face loaded through that
loader does not preload correctly, and the failure is quiet — font flashing or tofu at
runtime, not a build error. Korean must be self-hosted.

We use **Pretendard** (OFL 1.1) as the body face, self-hosted, and **BM Jua** (OFL) for
playful display headings. Latin-only faces such as Fredoka may use the Google loader.

## Consequences

Pretendard also removes the usual bilingual pairing problem: its Latin glyphs are drawn
to match its Hangul, so mixed Korean/English sentences do not seam mid-line and need no
metric correction. Its pre-built subset is ~261KB against ~1.96MB for the full variable
font, so ship the subset.

Where two faces do meet on one line, `next/font/local` exposes `ascent-override`,
`descent-override` and `size-adjust` through its `declarations` option.

Avoid Ownglyph fonts regardless of aesthetic fit: they prohibit modification and
redistribution, and the service has announced shutdown — a poor bet for an archive meant
to last decades.
