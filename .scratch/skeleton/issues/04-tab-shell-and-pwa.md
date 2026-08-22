# 04 — The tab shell and PWA install

**What to build:** The app's navigation — six tabs, installable to the home screen. Every
section is an empty themed page; this ticket delivers moving between them.

**Blocked by:** 01

Deliberately **not** blocked on auth: the shell is chrome and navigation, so it can be
built in parallel with 02 and 03.

**Status:** ready-for-agent

- [ ] Six tabs: **home · letters · photos · map · calendar · recall**. Calendar earned the
      sixth slot; five was never a designed limit
- [ ] **No home-page shortcut grid** — it duplicated the tab bar and was dropped
- [ ] Tab labels in Korean; the bar is comfortable at six items on a phone
- [ ] PWA manifest; installs to the home screen on **both iOS and Android** and launches
      standalone
- [ ] Mobile is the primary surface — verified at phone width first, desktop merely works
- [ ] Navigation works with no session (sections may be empty), so this is verifiable
      before 02 lands
