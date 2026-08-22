---
id: 014
title: What counts as news worth telling us about?
label: wayfinder:grilling
status: open
assignee:
blocked-by: [003]
---

## Question

Graduated from fog once the Entry index existed — notifications are now specifiable,
because "something new happened" has a uniform shape to derive from.

- **Derived or stored?** A notification could be a query over recent Entries not yet
  seen, or its own table of events. Derived is cheaper and self-healing; stored is
  explicit. Note that Entry already carries `occurred_at`, `kind` and `person_id`,
  which is most of what a feed needs.
- **What is newsworthy?** Not every Entry deserves a mention. A new Letter clearly does.
  200 photos imported after a trip is *one* piece of news, not 200 — so some grouping
  rule is needed.
- **Whose news?** Yangcho should see "Towee wrote you a letter", never her own actions
  reflected back. Person on the Entry makes this expressible.
- **Read tracking** for exactly two people — probably a last-seen timestamp per Person
  rather than per-notification read state.
- **Push to the phone, or in-app only?** Push means service workers, permission prompts,
  and a real subsystem. For two people who open the app daily, in-app may be enough —
  decide whether push earns its complexity, and note that a new Letter is the one event
  that might genuinely justify it.
- **Retention** — does news age out, or is the feed also a history?

Feeds the home page ticket, which consumes this.
