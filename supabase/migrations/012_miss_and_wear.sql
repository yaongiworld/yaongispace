-- 012 — two more small joys (PO, 2026-11-02): 💗 보고싶다 and wearing an item.
--
-- 💗 보고싶다 is a 콕's softer sibling: press and hold the other one's cat,
-- and their cat says "양초가 보고싶대요 💗" next time they open the app. Once a
-- day — a 콕 is play, this one should stay rare enough to mean something. It
-- lives in the poke table as another kind, so it inherits the same RLS, the
-- same News path and the same "never pushed" rule.
--
-- Wearing an item: the little rewards (lib/workout/items.ts) can now be put
-- on — one at a time, shown on the cat on Today for both of us.

alter table poke
  add column kind text not null default 'poke' check (kind in ('poke', 'miss'));

comment on column poke.kind is
  'poke = 콕 (three a day), miss = 💗 보고싶다 (once a day).';

-- The daily limit now depends on the kind: three 콕, one 💗.
create or replace function poke_three_a_day() returns trigger
language plpgsql
as $$
declare
  v_limit int := case new.kind when 'miss' then 1 else 3 end;
begin
  perform pg_advisory_xact_lock(hashtext('poke:' || new.from_person::text || ':' || new.day::text || ':' || new.kind));
  if (select count(*) from poke where from_person = new.from_person and day = new.day and kind = new.kind) >= v_limit then
    raise exception '% limit reached for today', new.kind using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- What the cat is wearing
-- ---------------------------------------------------------------------------

-- An item id from lib/workout/items.ts, or null. Whether it has been earned
-- is the app's rule (workout count), checked by the server action before it
-- calls wear_item; this column only remembers the choice.
alter table person add column worn_item text check (worn_item ~ '^[a-z]+$');

comment on column person.worn_item is
  'The little item this Person''s cat is wearing on Today, or null.';

-- person is read-only to the signed-in role; this is the one write it may
-- make to it, and only to its own row.
create function wear_item(p_item text) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_person_id() is null then
    return;
  end if;
  update person set worn_item = nullif(p_item, '') where id = current_person_id();
end;
$$;

revoke execute on function wear_item (text) from public;
grant execute on function wear_item (text) to yaongi_signed_in;

-- ---------------------------------------------------------------------------
-- News: the poke branch now carries its kind ('poke' or 'miss').
-- Otherwise 011's view, unchanged.
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
         k.kind,
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
