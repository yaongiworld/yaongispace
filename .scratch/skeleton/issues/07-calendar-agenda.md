# 07 — The calendar, as an agenda

**What to build:** A shared calendar for two people — anniversaries, trips, things to look
forward to. Not a work calendar, and not Google Calendar's shape.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] A **forward-scrolling agenda** opening at today. **No month grid is built**, not even
      as a toggle — for two people it is 27 empty cells and chrome
- [ ] The past is reachable by **scrolling up**; Events do not vanish when they happen
- [ ] Create, edit and delete an Event, shared by both — no per-person ownership
- [ ] Recurrence is **one yearly repeat flag plus a date**. No RRULE, no expansion, no
      exceptions, no instance-vs-series editing
- [ ] Events emit Entries with `occurred_at` set to when the Event happens
- [ ] **A Journey adopts Events by date range** — opening a Journey shows the Events inside
      its span. Neither creates the other; creating a Journey from an Event is at most a
      one-tap offer
- [ ] An **imminent Event appears in News** — there is no separate reminder system and no
      per-event reminder times
- [ ] Dates render in Korean convention ("2026년 8월 22일"), relative for the recent past
      ("3일 전"). Times in `Asia/Seoul`
- [ ] **No `.ics` feed and no native-calendar sync** — ruled out: Google refreshes external
      ICS on its own ~8–24h schedule with no manual refresh, while iOS polls every 5
      minutes, so the mirror would behave differently for each of us
