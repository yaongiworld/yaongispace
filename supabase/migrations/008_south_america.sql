-- 008 — PROJECT SOUTH AMERICA: the shared workout-and-evening planner.
--
-- The two of us plan the evening and train together, and each phone has to show
-- what the other has done. This migration adds only new `sa_` tables; it does
-- not touch anything 001–007 created.
--
-- Shape, and why:
--
--   sa_member  who we are *in this planner* (yangcho / tawi), one row per Person.
--   sa_day     one shared document per plan day (04:00 Asia/Seoul boundary), holding
--              the whole day's state: plan, ETAs, step records, workout completions.
--   sa_log     cardio logs, one row each, keyed by the log id the phone minted.
--   sa_change  an append-only record of every change that was applied.
--
-- The day is a document and not a pile of columns on purpose. The rules that
-- govern it (a heart press locks the plan; a workout completion is per person;
-- corrections keep their history) live in TypeScript and are tested there. The
-- database's job is to hold the document, serialise two people editing it at
-- once (row lock + version), and refuse everyone who is not one of us.
--
-- Nothing here is ever deleted: the app role has no DELETE grant on any of it.
-- A correction is a new revision inside the document, and `sa_change` keeps the
-- order things happened in.

-- ---------------------------------------------------------------------------
-- Who is who
-- ---------------------------------------------------------------------------

-- A Person's role in the planner. Deliberately a table, not a rule that reads
-- `person.display_name`: a name can be edited, a binding is a decision.
create table sa_member (
  person_id  uuid primary key references person (id) on delete cascade,
  persona    text not null unique check (persona in ('yangcho', 'tawi')),
  created_at timestamptz not null default now()
);

comment on table sa_member is
  'Binds a Person to yangcho or tawi in the South America planner. Unbound people are not members.';

-- One-time backfill from the two names the deploy guide seeds (DEPLOY.md, step
-- 6). After this, binding is a deliberate insert; nothing re-binds by name.
insert into sa_member (person_id, persona)
select id,
       case display_name when '토위' then 'tawi' when '양초' then 'yangcho' end
  from person
 where display_name in ('토위', '양초')
on conflict do nothing;

-- Whether the signed-in Person is one of the planner's two members. SECURITY
-- DEFINER so the policies below can ask without recursing into sa_member's own
-- policy.
create function sa_is_member() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from sa_member where person_id = current_person_id());
$$;

comment on function sa_is_member () is
  'True when the signed-in Person is bound to yangcho or tawi. The key every sa_ policy uses.';

-- ---------------------------------------------------------------------------
-- The day
-- ---------------------------------------------------------------------------

create table sa_day (
  -- "YYYY-MM-DD" of the plan day (a day ends at 04:00 Seoul time, not midnight).
  day        text primary key check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  state      jsonb not null check (jsonb_typeof(state) = 'object'),
  -- +1 on every applied change. Lets a phone tell its copy is stale.
  version    integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references person (id) on delete restrict
);

comment on table sa_day is
  'One shared document per plan day. Rules live in lib/south-america; this row only holds and serialises it.';

-- ---------------------------------------------------------------------------
-- Cardio logs
-- ---------------------------------------------------------------------------

-- The id comes from the phone that recorded it, so saving the same log twice —
-- a retry after a dropped connection — is one row. `kind` is kept apart from
-- the document so a kind this version does not understand is stored and shown
-- back untouched, never dropped.
create table sa_log (
  log_id     text primary key check (length(log_id) between 1 and 200),
  kind       text not null check (length(kind) > 0),
  doc        jsonb not null check (jsonb_typeof(doc) = 'object'),
  version    integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references person (id) on delete restrict
);

comment on table sa_log is
  'Exercise logs (cardio today). Keyed by the phone-minted log id, so a retried save is a no-op.';

-- ---------------------------------------------------------------------------
-- The ledger of changes
-- ---------------------------------------------------------------------------

create table sa_change (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  person_id  uuid not null references person (id) on delete restrict,
  persona    text not null check (persona in ('yangcho', 'tawi')),
  -- 'day:2036-01-01' or 'log:<id>'
  target     text not null,
  command    jsonb not null,
  -- The target's version after the change.
  version    integer not null
);

create index sa_change_target_idx on sa_change (target, id);

comment on table sa_change is
  'Append-only: what was applied, by whom, in what order. Not used to serve the app; there for diagnosis and rebuild.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table sa_member enable row level security;
alter table sa_day    enable row level security;
alter table sa_log    enable row level security;
alter table sa_change enable row level security;

-- Without these grants RLS is never reached. Note what is absent: no DELETE on
-- anything, and sa_member is read-only through the API — who the two of us are
-- is changed at the database, by a person, not by the app.
grant select on sa_member to yaongi_signed_in;
grant select, insert, update on sa_day, sa_log to yaongi_signed_in;
grant select, insert on sa_change to yaongi_signed_in;

create policy sa_member_readable on sa_member
  for select using (sa_is_member());

create policy sa_day_shared on sa_day
  for all using (sa_is_member()) with check (sa_is_member());

create policy sa_log_shared on sa_log
  for all using (sa_is_member()) with check (sa_is_member());

-- A change may only be recorded under your own Person id — a ledger that let
-- you write as the other one would not be a ledger.
create policy sa_change_readable on sa_change
  for select using (sa_is_member());

create policy sa_change_own_insert on sa_change
  for insert with check (sa_is_member() and person_id = current_person_id());
