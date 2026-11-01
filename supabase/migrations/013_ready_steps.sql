-- 013 — 오늘 운동각? and the four ready steps (PO, 2026-11-02).
--
-- The old prototype's Baby Steps (02_DECISIONS D-150, P-080, D-181), without
-- its timetable: each of us says whether today is a workout day (🏋️) or a
-- rest day (😴), and on a workout day ticks four steps — 👕 운동복 챙기기,
-- 🥚 단백질·간식, 🔄 환복, 🚶 출발. No times, no nagging, nothing pushed.
--
-- Rewards follow D-181: only 챙기기 (pack) and 출발 (depart) count, and they
-- count toward the cat's little items (lib/workout/items.ts) — never as a
-- number on screen. Unticking takes the reward back (D-188).

create table day_plan (
  person_id  uuid not null references person (id) on delete cascade,
  day        date not null,
  choice     text not null check (choice in ('go', 'rest')),
  updated_at timestamptz not null default now(),
  primary key (person_id, day)
);

comment on table day_plan is
  'Today, a workout day (go) or a rest day (rest) — each of us says, the other sees.';

create table day_step (
  person_id  uuid not null references person (id) on delete cascade,
  day        date not null,
  step       text not null check (step in ('pack', 'fuel', 'change', 'depart')),
  done_at    timestamptz not null default now(),
  primary key (person_id, day, step)
);

comment on table day_step is
  'A ready step ticked that day: pack (운동복), fuel (단백질·간식), change (환복), depart (출발).';

alter table day_plan enable row level security;
alter table day_step enable row level security;
grant select, insert, update, delete on day_plan, day_step to yaongi_signed_in;

-- Both of us see both; only you set yours.
create policy day_plan_readable on day_plan
  for select using (current_person_id() is not null);
create policy day_plan_own on day_plan
  for all using (person_id = current_person_id())
  with check (person_id = current_person_id());

create policy day_step_readable on day_step
  for select using (current_person_id() is not null);
create policy day_step_own on day_step
  for all using (person_id = current_person_id())
  with check (person_id = current_person_id());
