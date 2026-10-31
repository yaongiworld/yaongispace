-- 009 — the couple app: Today, Workout, Era, Moments (NEW_ROOM_BRIEF.md).
--
-- **Numbering.** PR #1 (`feat/south-america`, a draft, not on main) carries a
-- `008_south_america.sql`. This file is 009 so the two can never collide. If
-- PR #1 is ever merged, 008 will sort *before* this file on main even though
-- it was written first and applied later in production — check that the
-- migration runner applies it, rather than skipping it as "older".
--
-- Five new things, matching brief §9 "DB 큰 그림":
--
--   day_mood     · 기분       one face per person per day
--   day_offwork  · 퇴근 시간  when each of us plans to leave work, or did
--   day_memo     · 한 줄 메모 one line per person per day (anniversaries use
--                              the existing `event` table — 충돌 2)
--   workout      · 운동 기록  cardio / strength / core / stretch
--   era          · Era 진행   which travel era is open; cardio counts toward it
--
-- Plus one column on `person` saying which of the two cats is whose, and the
-- `news` view widened with three new kinds (충돌 6). No new notification
-- table: News stays a view over what already exists (ADR-0015).
--
-- "Day" here is always the Seoul calendar day, stored as a `date`. It is
-- what the Moments grid is keyed by and what a person means by "today".

-- ---------------------------------------------------------------------------
-- Which cat is whose
-- ---------------------------------------------------------------------------

-- 양초 is coral and on the left, 토위 is sky-blue and on the right, everywhere
-- (brief §9, 2026-11-01). The UI must not guess that from a display name the
-- Google account chose, so it is stated once, here.
alter table person
  add column cat text unique check (cat in ('yangcho', 'towee'));

comment on column person.cat is
  'Which of the two cats is this Person: yangcho (coral, left) or towee (sky, right).';

-- Backfill for the two people who exist today. A no-op on an empty database;
-- on production it relies on the display names being 양초 and 토위, and
-- anything else is left null for a person to set by hand rather than guessed.
update person set cat = 'yangcho'
 where display_name = '양초'
   and not exists (select 1 from person where cat = 'yangcho');
update person set cat = 'towee'
 where display_name = '토위'
   and not exists (select 1 from person where cat = 'towee');

-- ---------------------------------------------------------------------------
-- 기분 · 퇴근 시간 · 한 줄 메모 — one row per person per day
-- ---------------------------------------------------------------------------

create table day_mood (
  person_id  uuid not null references person (id) on delete cascade,
  day        date not null,
  -- The mood ids live in lib/today/moods.ts; the list here is its mirror.
  mood       text not null check (mood in ('happy', 'excited', 'calm', 'tired', 'sad', 'grumpy')),
  updated_at timestamptz not null default now(),
  primary key (person_id, day)
);

comment on table day_mood is
  'How each of us is today. Pressing a face is the whole diary entry for that day.';

create table day_offwork (
  person_id    uuid not null references person (id) on delete cascade,
  day          date not null,
  -- Planned leaving time, as minutes after midnight, on the 10-minute grid
  -- the clock wheel offers. Leaving the *office*, not arriving at the station.
  leave_minute integer check (leave_minute between 0 and 1430 and leave_minute % 10 = 0),
  -- "회사에서 나왔어요" — the moment it actually happened.
  left_at      timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (person_id, day),
  check (leave_minute is not null or left_at is not null)
);

comment on table day_offwork is
  'When each of us plans to leave work today, and whether we have.';

create table day_memo (
  person_id  uuid not null references person (id) on delete cascade,
  day        date not null,
  body       text not null check (length(btrim(body)) between 1 and 80),
  updated_at timestamptz not null default now(),
  primary key (person_id, day)
);

comment on table day_memo is
  'One line for the day. Optional — a mood alone already makes the day a diary entry.';

-- ---------------------------------------------------------------------------
-- Era
-- ---------------------------------------------------------------------------

create table era (
  -- A stable id; the trails and labels live in lib/era/eras.ts.
  id        text primary key check (id ~ '^[a-z_]+$'),
  opened_at timestamptz not null default now()
);

comment on table era is
  'A travel era we walk toward with cardio. Opening one is a row; only South America is open today.';

insert into era (id) values ('south_america');

-- ---------------------------------------------------------------------------
-- 운동 기록
-- ---------------------------------------------------------------------------

create table workout (
  id          uuid primary key default gen_random_uuid(),
  -- Whose workout it is …
  person_id   uuid not null references person (id) on delete cascade,
  -- … and who wrote it down. Different when one of us logs it for the other,
  -- which is what earns the little 💌 and a line in News.
  entered_by  uuid not null references person (id) on delete cascade,
  day         date not null,
  kind        text not null check (kind in ('cardio', 'strength', 'core', 'stretch')),
  -- Which exercise; the catalogue is lib/workout/catalog.ts. Not a foreign
  -- key: the list is code, and a renamed label must not rewrite history.
  exercise_id text not null check (exercise_id ~ '^[a-z_]+$'),

  -- Cardio: distance and time. Integer metres on a 0.1km grid, the rule
  -- carried over from PR #1 — never a float, never rounded.
  distance_m  integer check (distance_m between 100 and 49900 and distance_m % 100 = 0),
  minutes     integer check (minutes between 1 and 300),
  -- Strength: weight only (no reps, no time). Tenths of a kilogram so 22.5
  -- is exact; the wheel offers .0 and .5.
  weight_dg   integer check (weight_dg between 0 and 3000 and weight_dg % 5 = 0),
  -- Core: reps only.
  reps        integer check (reps between 1 and 300),
  -- The era a cardio session walks toward, fixed when it is written down so
  -- that opening the next era never moves old kilometres (brief §9 남은 5가지-4).
  era_id      text references era (id),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references person (id) on delete set null,

  -- Each kind carries exactly its own fields (brief §4, §9 남은 5가지-5).
  check (
    (kind = 'cardio'   and distance_m is not null and minutes is not null and weight_dg is null and reps is null and era_id is not null)
 or (kind = 'strength' and weight_dg is not null and distance_m is null and minutes is null and reps is null and era_id is null)
 or (kind = 'core'     and reps is not null and distance_m is null and minutes is null and weight_dg is null and era_id is null)
 or (kind = 'stretch'  and distance_m is null and minutes is null and weight_dg is null and reps is null and era_id is null)
  )
);

create index workout_day_idx on workout (day desc, created_at desc);
create index workout_person_idx on workout (person_id, kind, exercise_id, created_at desc);
create index workout_era_idx on workout (era_id) where era_id is not null;

comment on table workout is
  'One workout, written down by its owner or — with a 💌 — by the other one of us.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table day_mood    enable row level security;
alter table day_offwork enable row level security;
alter table day_memo    enable row level security;
alter table era         enable row level security;
alter table workout     enable row level security;

grant select, insert, update, delete on day_mood, day_offwork, day_memo, workout to yaongi_signed_in;
grant select on era to yaongi_signed_in;

-- Your own face, your own clock, your own line: both of us read them — that
-- is the point of a shared diary — but only you set yours.
create policy day_mood_readable on day_mood
  for select using (current_person_id() is not null);
create policy day_mood_own on day_mood
  for all using (person_id = current_person_id())
  with check (person_id = current_person_id());

create policy day_offwork_readable on day_offwork
  for select using (current_person_id() is not null);
create policy day_offwork_own on day_offwork
  for all using (person_id = current_person_id())
  with check (person_id = current_person_id());

create policy day_memo_readable on day_memo
  for select using (current_person_id() is not null);
create policy day_memo_own on day_memo
  for all using (person_id = current_person_id())
  with check (person_id = current_person_id());

create policy era_readable on era
  for select using (current_person_id() is not null);

-- Workouts are shared both ways on purpose: either of us may log one for the
-- other, and the other may fix it (brief §4 Workout). What is pinned is the
-- *signature*: you can only write down a workout as yourself.
create policy workout_readable on workout
  for select using (current_person_id() is not null);
create policy workout_written_as_self on workout
  for insert with check (entered_by = current_person_id());
create policy workout_fixed_by_either on workout
  for update using (current_person_id() is not null)
  with check (updated_by = current_person_id());
create policy workout_removed_by_either on workout
  for delete using (current_person_id() is not null);

-- Who wrote it down is a fact about the past, like event.person_id.
create function workout_keeps_its_author() returns trigger
language plpgsql
as $$
begin
  if new.entered_by is distinct from old.entered_by then
    raise exception 'who wrote a workout down does not change';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger workout_keeps_its_author
  before update on workout
  for each row execute function workout_keeps_its_author();

-- ---------------------------------------------------------------------------
-- News, widened (충돌 6)
-- ---------------------------------------------------------------------------

-- Three new kinds join the feed, and still nothing is stored:
--
--   mood         the other one changed today's face
--   offwork      the other one set a leaving time, or left
--   workout_for  the other one logged a workout *for you* ("기록해줬어요 💌")
--
-- Same columns, same rules as 007: never your own doing, a rolling window,
-- read as the caller. These rows have no Entry, so `entry_id` and
-- `source_id` are stable ids made up from the row's key — unique per kind
-- and per day, which is all the feed's grouping needs.
create or replace view news with (security_invoker = true) as
  select e.id                                              as entry_id,
         e.kind,
         e.source_id,
         e.title,
         e.text,
         e.person_id,
         p.display_name                                    as person_name,
         e.journey_id,
         j.title                                           as journey_title,
         news_arrived_at(e.kind, e.source_id, e.created_at) as arrived_at
    from entry e
    join person p on p.id = e.person_id
    left join journey j on j.id = e.journey_id
   where e.person_id <> current_person_id()
     and news_arrived_at(e.kind, e.source_id, e.created_at) <= now()
     and news_arrived_at(e.kind, e.source_id, e.created_at) > now() - news_window()
  union all
  select md5('mood:' || m.person_id || ':' || m.day)::uuid,
         'mood',
         md5('mood:' || m.person_id || ':' || m.day)::uuid,
         m.mood,
         '',
         m.person_id,
         p.display_name,
         null::uuid,
         null::text,
         m.updated_at
    from day_mood m
    join person p on p.id = m.person_id
   where m.person_id <> current_person_id()
     and m.updated_at <= now()
     and m.updated_at > now() - news_window()
  union all
  select md5('offwork:' || o.person_id || ':' || o.day)::uuid,
         'offwork',
         md5('offwork:' || o.person_id || ':' || o.day)::uuid,
         case
           when o.left_at is not null then 'left'
           else lpad((o.leave_minute / 60)::text, 2, '0') || ':' || lpad((o.leave_minute % 60)::text, 2, '0')
         end,
         '',
         o.person_id,
         p.display_name,
         null::uuid,
         null::text,
         o.updated_at
    from day_offwork o
    join person p on p.id = o.person_id
   where o.person_id <> current_person_id()
     and o.updated_at <= now()
     and o.updated_at > now() - news_window()
  union all
  select w.id,
         'workout_for',
         w.id,
         w.exercise_id,
         '',
         w.entered_by,
         p.display_name,
         null::uuid,
         null::text,
         w.created_at
    from workout w
    join person p on p.id = w.entered_by
   where w.entered_by <> w.person_id
     and w.person_id = current_person_id()
     and w.created_at <= now()
     and w.created_at > now() - news_window();

comment on view news is
  'What the other one of us has been up to lately. Derived from Entries and the day tables, ordered by arrival, never stored (ADR-0015).';
