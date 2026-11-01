-- 011 — 콕 찌르기 (brief §9 남은 5가지-2; PO chose it first, 2026-11-02).
--
-- Tap the other one's cat and their Today cat says so, the next time they
-- open the app. No push, no badge, no sound — it waits to be found. At most
-- three a day from each of us, so it stays a nudge and never becomes a
-- nag; the PO may switch it off if it ever feels like pressure (POKE_ENABLED
-- in lib/poke.ts hides it without touching this table).

create table poke (
  id          uuid primary key default gen_random_uuid(),
  from_person uuid not null references person (id) on delete cascade,
  to_person   uuid not null references person (id) on delete cascade,
  -- The Seoul day it was sent, so "three a day" means the day we live in.
  day         date not null,
  created_at  timestamptz not null default now(),
  check (from_person <> to_person)
);

create index poke_from_day_idx on poke (from_person, day);
create index poke_to_idx on poke (to_person, created_at desc);

comment on table poke is
  'A 콕: one of us tapping the other''s cat. Three a day at most, found on opening the app, never pushed.';

alter table poke enable row level security;
grant select, insert on poke to yaongi_signed_in;

-- Both ends can see it; only you can send one, and only as yourself.
create policy poke_readable on poke
  for select using (from_person = current_person_id() or to_person = current_person_id());
create policy poke_sent_as_self on poke
  for insert with check (from_person = current_person_id());

-- Three a day. Enforced here, not only in the UI, so a double-tap or a
-- second phone cannot make it four.
create function poke_three_a_day() returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtext('poke:' || new.from_person::text || ':' || new.day::text));
  if (select count(*) from poke where from_person = new.from_person and day = new.day) >= 3 then
    raise exception 'three pokes a day' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger poke_three_a_day
  before insert on poke
  for each row execute function poke_three_a_day();

-- ---------------------------------------------------------------------------
-- News: a 콕 sent to you (never your own), same rules as every other kind.
-- The view is 009's, unchanged, with one more branch at the end.
-- ---------------------------------------------------------------------------

create or replace view news with (security_invoker = true) as
  select e.id                                              as entry_id,
         e.kind,
         e.source_id,
         e.title,
         e.text,
         e.person_id,
         coalesce(case p.cat when 'yangcho' then '양초' when 'towee' then '토위' end, p.display_name)
                                                           as person_name,
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
         coalesce(case p.cat when 'yangcho' then '양초' when 'towee' then '토위' end, p.display_name),
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
         coalesce(case p.cat when 'yangcho' then '양초' when 'towee' then '토위' end, p.display_name),
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
         coalesce(case p.cat when 'yangcho' then '양초' when 'towee' then '토위' end, p.display_name),
         null::uuid,
         null::text,
         w.created_at
    from workout w
    join person p on p.id = w.entered_by
   where w.entered_by <> w.person_id
     and w.person_id = current_person_id()
     and w.created_at <= now()
     and w.created_at > now() - news_window()
  union all
  select k.id,
         'poke',
         k.id,
         null::text,
         '',
         k.from_person,
         coalesce(case p.cat when 'yangcho' then '양초' when 'towee' then '토위' end, p.display_name),
         null::uuid,
         null::text,
         k.created_at
    from poke k
    join person p on p.id = k.from_person
   where k.to_person = current_person_id()
     and k.created_at <= now()
     and k.created_at > now() - news_window();
