# 06 — Home as a hearth

**What to build:** Opening the app shows the cat, and one quiet line about what the other
person has been up to. This is where News becomes real.

**Blocked by:** 05

Blocked on Letters specifically because News needs something to be news *about* — a feed
with nothing in it cannot be verified.

**Status:** ready-for-agent

- [ ] The hero cat is upper-centre and **navigates nowhere** — tap gets a squash-and-
      sparkle, nothing more. A slow idle bob; **CSS 3D transforms, not WebGL**
      ([ADR-0008](../../../docs/adr/0008-css-3d-not-webgl.md))
- [ ] **News is derived** — a query over Entries, no notifications table
      ([ADR-0015](../../../docs/adr/0015-news-is-a-derived-feed.md))
- [ ] News orders by **`created_at`**, the one place that does not use `occurred_at`
- [ ] Filtered to `person_id != me` — you never see your own actions reflected back
- [ ] Collapses **by Journey where one exists, else by day**; a Letter is never grouped
- [ ] A **stored last-seen timestamp per Person** trims the feed. A rebuild of the Entry
      index must **not** resurrect dismissed news — test this
- [ ] A sealed letter generates news on its **unseal date**, not its creation date
- [ ] Quiet day shows a **warm nothing** ("조용한 하루") — never silence, **never a prompt**
- [ ] The cat's **mood mirrors the top News item**, time-of-day as fallback, so cat and
      caption cannot contradict
- [ ] Rolling ~30 days — the feed is a window, not a history
- [ ] Interim cat is **Fluent Emoji 3D (MIT)**, explicitly a placeholder until the
      commissioned yaongi lands
