# 01 — Project scaffolding and the Soft Clay shell

**What to build:** A deployed Yaongispace that renders one themed page in Korean. Nothing
is interactive yet — this exists so every later ticket has a place to land.

Stack matches `../llc/dashboard` (Next.js 15, React 19, Tailwind 4, TypeScript, Vercel) —
familiarity beats novelty for something meant to last.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `next build` and `typecheck` pass; the app deploys to Vercel
- [ ] **Pretendard is self-hosted via `next/font/local`** — `next/font/google` silently
      drops CJK subsets and fails as tofu rather than an error
      ([ADR-0007](../../../docs/adr/0007-self-host-korean-fonts.md))
- [ ] BM Jua + Fredoka wired for display headings
- [ ] Soft Clay tokens exist as Tailwind theme values: warm peach→pink→lilac gradient,
      puffy white cards (24–34px radii), warm brown ink
- [ ] `color-scheme: light` is set and **no dark mode styles exist anywhere**
- [ ] Korean text renders correctly at every weight used — verified visually, not assumed
- [ ] Integration test setup runs a **real Postgres** in Docker (no mocked Supabase);
      an empty suite passes in CI
