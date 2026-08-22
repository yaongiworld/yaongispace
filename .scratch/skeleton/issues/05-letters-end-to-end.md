# 05 — Letters, end to end

**What to build:** One of us writes a letter, seals it, and the other reads it. The first
section that is genuinely *ours* rather than infrastructure.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Write a letter addressed to the other Person; body face is **Gaegu** (OFL)
- [ ] The verb is **봉하기 (seal)**, never 보내기 (send) — sealing is the ceremony
- [ ] **Editable until read, then immutable.** Opening it locks it, so the recipient never
      sees a letter change under them
- [ ] **Sealed until a date** works: the letter is invisible to the recipient until then —
      no title, no sender, **no countdown**, nothing that leaks its existence
- [ ] Reading is per-Person and load-bearing: **only opening the letter seals it.** Seeing
      it referenced anywhere else must not
- [ ] Letters emit Entries and are findable by pgroonga search, including Korean
- [ ] Integration test: seal → edit is refused after read → a sealed-until-date letter is
      invisible before its date and appears after

**Explicitly out of this ticket:** AI suggestions
([ADR-0011](../../../docs/adr/0011-ai-suggests-in-letters-never-writes.md)) and generated
letter designs. Both are separable, and both send letter bodies to a commercial API —
worth landing the section without that exposure first.
