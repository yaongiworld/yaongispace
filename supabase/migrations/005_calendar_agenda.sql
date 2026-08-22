-- 005 — The calendar, as an agenda.
--
-- The `event` table already exists (002), it already carries `repeats_yearly`,
-- it is already shared by RLS, and it already emits an Entry via
-- `entry_from_event` (003). **This migration deliberately recreates none of
-- that.** What was missing is not storage — it is the three *readings* of the
-- event table the agenda needs, and each of them is a place where the app
-- would otherwise have written the same subtle date arithmetic slightly
-- differently in three files.
--
-- So this file adds no table. It adds:
--
--   1. `event_occurrences(from, to)` — the agenda itself, which is the only
--      thing that knows how `repeats_yearly` becomes a date on your screen.
--   2. `journey_events(journey)` — a Journey adopting Events by date range.
--   3. `event_is_imminent(...)` — the predicate News reads, so that "imminent"
--      means one thing rather than one thing per caller.
--
-- The through-line: **an occurrence is computed, never stored.** No expansion
-- table, no materialised instances, no exception rows. A repeating Event is
-- one row forever, and the agenda is a function over it. That is what keeps
-- "no RRULE" true a year from now, when somebody wants to move just the 2027
-- anniversary and discovers there is nowhere to put the exception — which is
-- the correct answer, not a missing feature.

-- ---------------------------------------------------------------------------
-- Time zone
-- ---------------------------------------------------------------------------

-- Everything here reasons in `Asia/Seoul`, and it is written out rather than
-- left to the session's TimeZone setting. A migration that inherited the
-- caller's zone would put an anniversary on the wrong day for whoever ran it
-- from a laptop still set to UTC — and it would do so only near midnight,
-- which is exactly the bug that reaches production.
--
-- Both of us live in Seoul and always have. If that ever stops being true this
-- is the one constant to change, and it is deliberately a single literal
-- rather than a column on Person: a shared calendar with two time zones is a
-- different product.

-- ---------------------------------------------------------------------------
-- The agenda
-- ---------------------------------------------------------------------------

-- Every Event occurring in a window, with repeats projected onto it.
--
-- This is the whole calendar. The agenda scrolls by asking for a window, the
-- past is reachable by asking for an earlier one, and nothing anywhere needs
-- to know that a repeating Event is stored on one date and shown on another.
--
-- **`occurs_at` is the date this occurrence lands on; `occurred_at` is the row
-- as stored.** Both are returned, because they answer different questions: the
-- agenda sorts and groups by the first, and "since 2016" is only answerable
-- from the second. Collapsing them would lose the original date the moment a
-- repeat was projected.
--
-- How a repeat is projected: take the stored month and day, put them in each
-- year the window touches, and keep the ones that land inside it. That is the
-- entire recurrence engine, and it fits in a `generate_series`.
--
-- **February 29th resolves to March 1st in a common year.** Postgres would
-- otherwise raise `date/time field value out of range` and the whole agenda
-- would fail to load for three years out of four — a spectacular failure from
-- one anniversary. March 1st is chosen over February 28th because the
-- occurrence should not drift into the month before; neither is objectively
-- right, and picking one and writing it down beats discovering it.
create function event_occurrences(
  p_from timestamptz,
  p_to   timestamptz
) returns table (
  id             uuid,
  title          text,
  description    text,
  -- When this occurrence lands. For a non-repeating Event this equals
  -- `occurred_at`; for a repeat it is the stored day in the window's year.
  occurs_at      timestamptz,
  -- The row as stored, so "우리 10주년" is still computable.
  occurred_at    timestamptz,
  ends_at        timestamptz,
  all_day        boolean,
  repeats_yearly boolean,
  place_id       uuid,
  person_id      uuid,
  -- True when this row is a projection rather than the stored date itself.
  -- The UI shows a repeat marker from this and never by comparing dates.
  is_repeat      boolean
)
language sql
stable
as $$
  -- The Events that happen once. Nothing clever: the stored date is the date.
  select e.id,
         e.title,
         e.description,
         e.occurred_at              as occurs_at,
         e.occurred_at,
         e.ends_at,
         e.all_day,
         e.repeats_yearly,
         e.place_id,
         e.person_id,
         false                      as is_repeat
    from event e
   where not e.repeats_yearly
     and e.occurred_at >= p_from
     and e.occurred_at <  p_to

  union all

  -- The repeats, projected onto every year the window touches.
  --
  -- The year range is derived from the window rather than from the Event, so
  -- asking for one week costs one or two candidate dates per repeating Event
  -- — not one per year since it was created.
  select e.id,
         e.title,
         e.description,
         projected.occurs_at,
         e.occurred_at,
         -- The duration is carried across, so a repeating Event that spans
         -- days still spans them in the year it is shown. Anchoring `ends_at`
         -- to the stored year instead would render a 2016 end date beneath a
         -- 2026 start.
         case
           when e.ends_at is null then null
           else projected.occurs_at + (e.ends_at - e.occurred_at)
         end                        as ends_at,
         e.all_day,
         e.repeats_yearly,
         e.place_id,
         e.person_id,
         -- The anniversary itself is not a repeat; every later year is.
         projected.occurs_at <> e.occurred_at as is_repeat
    from event e
    cross join lateral (
      select make_timestamptz(
               y::int,
               extract(month from e.occurred_at at time zone 'Asia/Seoul')::int,
               -- Feb 29 in a common year: fall back to the 1st and shift a
               -- month, which lands on March 1st.
               case
                 when extract(month from e.occurred_at at time zone 'Asia/Seoul') = 2
                  and extract(day   from e.occurred_at at time zone 'Asia/Seoul') = 29
                  and not (y % 4 = 0 and (y % 100 <> 0 or y % 400 = 0))
                 then 1
                 else extract(day from e.occurred_at at time zone 'Asia/Seoul')::int
               end,
               extract(hour   from e.occurred_at at time zone 'Asia/Seoul')::int,
               extract(minute from e.occurred_at at time zone 'Asia/Seoul')::int,
               extract(second from e.occurred_at at time zone 'Asia/Seoul'),
               'Asia/Seoul'
             )
             + case
                 when extract(month from e.occurred_at at time zone 'Asia/Seoul') = 2
                  and extract(day   from e.occurred_at at time zone 'Asia/Seoul') = 29
                  and not (y % 4 = 0 and (y % 100 <> 0 or y % 400 = 0))
                 then interval '1 month'
                 else interval '0'
               end as occurs_at
        from generate_series(
               extract(year from p_from at time zone 'Asia/Seoul')::int,
               extract(year from p_to   at time zone 'Asia/Seoul')::int
             ) as y
    ) as projected
   where e.repeats_yearly
     and projected.occurs_at >= p_from
     and projected.occurs_at <  p_to
     -- A repeat does not exist before the Event it repeats. An anniversary
     -- added in 2016 has no 2015 occurrence, and scrolling the agenda far
     -- enough back must not invent one.
     and projected.occurs_at >= date_trunc(
           'day', e.occurred_at at time zone 'Asia/Seoul'
         ) at time zone 'Asia/Seoul'
$$;

comment on function event_occurrences (timestamptz, timestamptz) is
  'Every Event in a window, with yearly repeats projected onto it. Occurrences are computed, never stored.';

-- ---------------------------------------------------------------------------
-- A Journey adopts Events
-- ---------------------------------------------------------------------------

-- The Events inside a Journey's span.
--
-- **Adoption is by date range and nothing else.** There is no `journey_id` on
-- `event` and there must not be one: a stored link would be a second answer to
-- "is this Event part of this Journey", free to disagree with the dates, and
-- the disagreement would be invisible until somebody moved the Journey. 002
-- says this in the table comment; this function is what makes it usable rather
-- than merely intended.
--
-- Neither creates the other. Adding an Event inside a Journey's span does not
-- edit the Journey, and extending a Journey does not edit an Event — the
-- Journey simply gathers more when next opened. That is the whole mechanism.
--
-- A Journey with no `ended_on` is one we are still in, so it adopts everything
-- from its start onward, including Events in the future. That is the correct
-- reading of "still in it" and it is why the upper bound is conditional.
--
-- "Onward" is bounded at the last stored Event rather than at `infinity`,
-- because a yearly repeat has an occurrence in *every* year and an unbounded
-- window would ask for all of them — `generate_series` cannot take infinity
-- and would fail outright, which is how this bound was found. Stopping at the
-- furthest Event we actually hold loses nothing: there is by definition
-- nothing to adopt beyond it, and the bound moves out on its own as soon as
-- something is scheduled further ahead. `+ 1 year` covers the repeat of an
-- Event stored just before that edge.
--
-- Repeats are included via `event_occurrences`, so the 2026 anniversary is
-- adopted by a 2026 Journey even though the row is stored in 2016.
create function journey_events(p_journey_id uuid)
returns table (
  id             uuid,
  title          text,
  description    text,
  occurs_at      timestamptz,
  occurred_at    timestamptz,
  ends_at        timestamptz,
  all_day        boolean,
  repeats_yearly boolean,
  place_id       uuid,
  person_id      uuid,
  is_repeat      boolean
)
language sql
stable
as $$
  select o.*
    from journey j
    cross join lateral event_occurrences(
      -- A Journey's span is dates, not timestamps, and a date becomes a moment
      -- only once you say where. Seoul midnight, like everything else here —
      -- `::timestamptz` alone would use the session's zone and shift the whole
      -- trip by nine hours when run from a UTC machine.
      j.started_on::timestamp at time zone 'Asia/Seoul',
      -- `ended_on` is inclusive of that whole day, so the exclusive upper
      -- bound is the following midnight. An Event at 8pm on the last day of a
      -- Journey belongs to it; an off-by-one here would silently drop the
      -- final evening of every trip.
      case
        when j.ended_on is null then greatest(
          (select max(e2.occurred_at) from event e2) + interval '1 year',
          j.started_on::timestamp at time zone 'Asia/Seoul'
        )
        else (j.ended_on + 1)::timestamp at time zone 'Asia/Seoul'
      end
    ) as o
   where j.id = p_journey_id
$$;

comment on function journey_events (uuid) is
  'The Events inside a Journey span. Adoption is by date range — neither creates the other (ADR-0014).';

-- ---------------------------------------------------------------------------
-- Imminent, for News
-- ---------------------------------------------------------------------------

-- Whether an occurrence is close enough to be worth mentioning.
--
-- **Reminders are just News.** There is no reminder table, no per-Event
-- reminder time, and no second notification system — an Event that is nearly
-- here shows up in the feed, and that is the entire mechanism. This function
-- exists so that "nearly here" is defined once instead of being a magic
-- interval in whichever query got written first.
--
-- Seven days, chosen because it is the horizon a two-person calendar actually
-- plans over: far enough that an anniversary does not surprise you, near
-- enough that the feed is not a list of everything.
--
-- Note that this is about the *occurrence*, not the row — so the 2026
-- projection of a 2016 anniversary is imminent in November 2026, which is the
-- entire point and is invisible if you read `event.occurred_at` directly.
create function event_is_imminent(
  p_occurs_at timestamptz,
  p_now       timestamptz default now(),
  p_within    interval default interval '7 days'
) returns boolean
language sql
immutable
as $$
  select p_occurs_at >= p_now and p_occurs_at < p_now + p_within;
$$;

comment on function event_is_imminent (timestamptz, timestamptz, interval) is
  'Is this occurrence near enough to be News? Reminders are just News — there is no reminder system.';

-- What News reads.
--
-- ADR-0015: News is a **derived feed**, a query over recent Entries, never a
-- stored table. So this is a view, not a table, and nothing writes to it.
--
-- Ticket 06 owns News itself and this is deliberately not it — no last-seen
-- filtering, no "the other person's doing" rule, no collapsing by Journey.
-- Those are the feed's rules and they belong to the feed. What is here is the
-- one thing ticket 06 could not compute on its own: an imminent Event is a
-- *projected occurrence*, and the projection lives in this file.
--
-- The Entry id is carried so News can join to the index it already reads
-- rather than special-casing Events into a second code path. `entry_id` is
-- null only in the window between an Event being inserted and its trigger
-- running, which is to say never.
create view imminent_event as
  select o.id            as event_id,
         e.id            as entry_id,
         o.title,
         o.description,
         o.occurs_at,
         -- Named `stored_on` rather than `occurred_at`, for two reasons that
         -- happen to agree. It is the more honest word — in this view it means
         -- "the date the row was filed under", and the date this occurrence
         -- actually happens is `occurs_at` beside it. And `occurred_at` is a
         -- load-bearing name in this schema: a test asserts exactly which
         -- things carry one, because it is the primary time axis and a stray
         -- one is how the axis gets quietly forked. A derived view should not
         -- be answering that question at all.
         o.occurred_at   as stored_on,
         o.all_day,
         o.repeats_yearly,
         o.is_repeat,
         o.place_id,
         -- Whose doing it was: News shows the *other* person's, and it reads
         -- this to know which is which.
         o.person_id
    from event_occurrences(now(), now() + interval '7 days') as o
    left join entry e on e.kind = 'event' and e.source_id = o.id
   where event_is_imminent(o.occurs_at);

comment on view imminent_event is
  'Events near enough to be News, repeats projected. News derives its feed from this (ADR-0015); nothing is stored.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- The functions are `stable`/`immutable` and **not** `security definer`: they
-- read `event` as the caller, so RLS applies exactly as it does to a direct
-- select. That is deliberate. A definer-rights agenda would be a way to read
-- Events around the policy, and there is nothing here that needs the owner's
-- authority — unlike the Entry triggers, which do.
--
-- The practical consequence worth knowing: signed out, `event_occurrences`
-- returns zero rows rather than an error. That is the same answer a direct
-- select gives, which is the point.
grant execute on function event_occurrences (timestamptz, timestamptz) to yaongi_signed_in;
grant execute on function journey_events (uuid) to yaongi_signed_in;
grant execute on function event_is_imminent (timestamptz, timestamptz, interval) to yaongi_signed_in;

-- The view is likewise not `security_barrier`-exempt: it selects through
-- `event_occurrences`, which reads `event` under the caller's RLS.
grant select on imminent_event to yaongi_signed_in;
