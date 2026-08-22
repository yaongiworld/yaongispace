-- 003 — The Entry index: one place to search everything.
--
-- Recall must read across letters, photos, places, visits, events and notes,
-- which needs one uniform place to search. A single polymorphic table holding
-- all of them was rejected — a letter's body and a photo's dimensions do not
-- belong in the same row — and so was leaving the six tables independent,
-- which forces the agent to know all six (ADR-0001).
--
-- So each section keeps its own honest table (002), and every row additionally
-- registers a lightweight **Entry**: kind, title, searchable text, occurred-at,
-- place, person, journey, and a pointer back to the source row.
--
-- Entry is **derived data**. It is rebuildable from the source tables, must
-- never be the only copy of anything, and `rebuild_entry_index()` at the
-- bottom of this file is therefore always a safe repair.
--
--
-- === HOW TO ADD A NEW SOURCE TABLE ==========================================
--
-- Later tickets extend this. Read the "Adding a source table" section at the
-- bottom of this file before you do — it is four steps and it is written so
-- that you never edit anything another ticket owns.
--
-- The rule that makes that possible: **one trigger function per source table,
-- never a dispatcher that switches on kind.** A single function would mean
-- every section rewrites the same body and collides on every merge. Per-table
-- functions cost the same total code and merge cleanly, because two sections
-- adding two functions touch two disjoint regions of the file.
-- ============================================================================

create extension if not exists pgroonga;
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Entry
-- ---------------------------------------------------------------------------

-- The shared index over everything, carrying only what recall needs.
--
-- `(kind, source_id)` is the identity of an Entry, not `id`: exactly one Entry
-- per source row, enforced by the database rather than by every trigger
-- remembering to check. That unique constraint is also what lets each trigger
-- be a single idempotent upsert instead of a delete-then-insert.
--
-- `kind` is free text, deliberately. An enum would mean every new section
-- ships an `ALTER TYPE` in a migration another agent is also editing — the
-- exact collision this file is shaped to avoid. The set of kinds is small and
-- knowable by reading the trigger functions below.
--
-- `text` is the searchable body: title and prose concatenated by the source
-- table's own trigger, which is the only thing that knows what is worth
-- reading. There is **no language column** here or anywhere — mixed and
-- code-switched content is the normal case and pgroonga indexes both halves in
-- one field (ADR-0003).
--
-- `embedding` exists but is filled in later by the app, not by a trigger:
-- generating one is a network call to a commercial API (ADR-0004) and a
-- trigger that made HTTP requests would make every insert fail when the
-- vendor is down. Null means "not embedded yet", which recall treats as
-- lexical-only rather than as an error.
create table entry (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (length(btrim(kind)) > 0),
  source_id   uuid not null,
  title       text,
  text        text not null default '',
  -- The primary time axis. Every Entry has one, which is what lets the
  -- timeline and recall sort across kinds without knowing what they are.
  occurred_at timestamptz not null,
  -- Whose doing this was. News reads it to show only the *other* person's.
  person_id   uuid references person (id) on delete set null,
  place_id    uuid references place (id) on delete set null,
  journey_id  uuid references journey (id) on delete set null,
  -- When the thing arrived in the app. News is the one thing that orders by
  -- this rather than occurred_at (ADR-0015): a letter written today about last
  -- October is news today, and a Takeout backfill of 2022 is not.
  created_at  timestamptz not null default now(),
  embedding   vector(1536),

  unique (kind, source_id)
);

-- Korean-aware search, and the reason this is pgroonga and not tsvector.
-- Postgres has no Korean configuration and treats a run of CJK as one token,
-- so `to_tsvector('제주도에서')` produces a single token and searching 제주
-- never matches it — silently, while looking correct in English testing
-- (ADR-0003). pgroonga segments properly and indexes English in the same
-- index, so there is one search path rather than two.
create index entry_text_idx on entry using pgroonga (text);
create index entry_title_idx on entry using pgroonga (title);

create index entry_occurred_idx on entry (occurred_at desc);
create index entry_created_idx on entry (created_at desc);
create index entry_journey_idx on entry (journey_id) where journey_id is not null;
create index entry_source_idx on entry (kind, source_id);

-- **No vector index.** An IVFFlat or HNSW index below roughly 100k rows is
-- slower than the sequential scan it replaces, needs training data we do not
-- have yet, and trades exact results for approximate ones to solve a problem
-- we do not have. Two people will not reach 100k Entries soon; when we do,
-- adding one is a one-line migration against data already in place.

comment on table entry is
  'The derived index over everything. Rebuildable from the source tables — never the only copy (ADR-0001).';

-- ---------------------------------------------------------------------------
-- The shared helper
-- ---------------------------------------------------------------------------

-- What every per-table trigger function calls. Factoring it out is what keeps
-- adding a source table down to one small function: the upsert semantics, the
-- text normalisation and the identity rule live here, once, and a new section
-- supplies only the six values that are actually about its own table.
--
-- Deliberately *not* a trigger itself. A shared trigger function would have to
-- ask "which table am I on", which is the dispatcher this design rejects.
--
-- Every function in this file is `security definer`, and that is load-bearing
-- rather than incidental. A trigger runs as whoever fired it, so a signed-in
-- Person writing a Letter would need INSERT on `entry` for the trigger to
-- succeed — and granting that would let the app write Entries by hand, which
-- is exactly what must be impossible: a hand-written Entry is a row the next
-- rebuild silently deletes, data that looks stored and is not. Definer rights
-- let the index be maintained with the owner's authority while the caller
-- still holds nothing but SELECT on it. `search_path` is pinned for the usual
-- reason: a definer function that resolves names through the caller's path is
-- a way to run the owner's privileges against somebody else's table.
create function entry_put(
  p_kind        text,
  p_source_id   uuid,
  p_title       text,
  p_text        text,
  p_occurred_at timestamptz,
  p_person_id   uuid,
  p_place_id    uuid,
  p_journey_id  uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into entry (kind, source_id, title, text, occurred_at, person_id, place_id, journey_id)
       values (
         p_kind,
         p_source_id,
         nullif(btrim(coalesce(p_title, '')), ''),
         btrim(coalesce(p_text, '')),
         p_occurred_at,
         p_person_id,
         p_place_id,
         p_journey_id
       )
  on conflict (kind, source_id) do update
     set title       = excluded.title,
         text        = excluded.text,
         occurred_at = excluded.occurred_at,
         person_id   = excluded.person_id,
         place_id    = excluded.place_id,
         journey_id  = excluded.journey_id,
         -- The embedding is derived from the text, so text that changed is
         -- text that must be re-embedded. Clearing it is how the app knows.
         embedding   = case
                         when entry.text is distinct from excluded.text then null
                         else entry.embedding
                       end;
end;
$$;

comment on function entry_put (text, uuid, text, text, timestamptz, uuid, uuid, uuid) is
  'Upsert one Entry. The shared half of every per-table trigger function.';

-- The other half of the shared logic: forget an Entry when its source row is
-- gone. Identical for every table, so it is genuinely one function — and
-- because it reads `TG_ARGV[0]` rather than the table name, adding a section
-- means attaching this trigger, not writing another one.
create function entry_forget() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from entry where kind = tg_argv[0] and source_id = old.id;
  return old;
end;
$$;

comment on function entry_forget () is
  'Drop the Entry for a deleted source row. Shared by every source table; pass the kind as a trigger argument.';

-- Joining a title and a body into one searchable field, skipping the empties.
-- Small enough to inline and repeated in every trigger below, which is exactly
-- why it is here: the day we decide captions should also carry the Journey
-- name, it changes in one place.
create function entry_text(variadic parts text[]) returns text
language sql
immutable
as $$
  select btrim(coalesce(
    array_to_string(
      array(select btrim(p) from unnest(parts) as p where btrim(coalesce(p, '')) <> ''),
      E'\n'
    ),
    ''
  ));
$$;

comment on function entry_text (text[]) is
  'Join the non-empty parts of a source row into one searchable field.';

-- ---------------------------------------------------------------------------
-- One trigger function per source table
-- ---------------------------------------------------------------------------
--
-- Each of the following owns exactly one table and is touched by nobody else.
-- They are ordered as 002 declares the tables. Add new ones at the end.

-- Letter ---------------------------------------------------------------------
--
-- The author is whose doing it was: News shows you what the *other* person
-- did, and a letter is the writer's act, not the reader's.
--
-- A sealed letter still gets an Entry, and it must: Entry is derived, so
-- withholding one would make the index disagree with the source and a rebuild
-- would "resurrect" it. The seal is enforced on `letter` by RLS (002) and by
-- the News query, which reads `unseal_at` — hiding the row from the index
-- instead would be hiding it from Recall forever, including from its author.
create function entry_from_letter() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform entry_put(
    'letter',
    new.id,
    new.title,
    entry_text(new.title, new.body),
    new.occurred_at,
    new.author_id,
    null,
    new.journey_id
  );
  return new;
end;
$$;

create trigger entry_from_letter
  after insert or update on letter
  for each row execute function entry_from_letter();

create trigger entry_forget_letter
  after delete on letter
  for each row execute function entry_forget('letter');

-- Photo ----------------------------------------------------------------------
--
-- A Photo's searchable text is its caption, and only its caption. Recall reads
-- captions and metadata, never the photographs themselves — there is no vision
-- model in this loop and pretending otherwise in the index would be a claim we
-- cannot support.
--
-- `occurred_at_effective` rather than `occurred_at`: the stored correction is
-- the whole reason that generated column exists, and an index that ignored it
-- would put the photo back on the wrong day for everyone except the photo
-- detail page.
--
-- A tombstoned Photo (ADR-0013) has no Entry — it should not surface in recall
-- or news — but the row itself is untouched, so undeleting one restores its
-- Entry on the next write, and a rebuild agrees.
create function entry_from_photo() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is not null then
    delete from entry where kind = 'photo' and source_id = new.id;
    return new;
  end if;

  perform entry_put(
    'photo',
    new.id,
    null,
    entry_text(new.caption),
    new.occurred_at_effective,
    new.person_id,
    new.place_id,
    new.journey_id
  );
  return new;
end;
$$;

create trigger entry_from_photo
  after insert or update on photo
  for each row execute function entry_from_photo();

create trigger entry_forget_photo
  after delete on photo
  for each row execute function entry_forget('photo');

-- Place ----------------------------------------------------------------------
--
-- A Place is indexed whether or not we have been there, which is what makes
-- "where did we want to go?" answerable. **A Place with no Visit is a wish**
-- (ADR-0002) and nothing here says so — there is no flag to read, and adding
-- one to the Entry would be reintroducing the status field the ADR removed.
--
-- A Place has no occurred_at of its own: it did not happen, it exists. Its
-- Visits are what happened. `created_at` stands in so the column is honest
-- about being non-null rather than inventing a date.
create function entry_from_place() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform entry_put(
    'place',
    new.id,
    new.name,
    entry_text(new.name, new.note),
    new.created_at,
    new.person_id,
    new.id,
    null
  );
  return new;
end;
$$;

create trigger entry_from_place
  after insert or update on place
  for each row execute function entry_from_place();

create trigger entry_forget_place
  after delete on place
  for each row execute function entry_forget('place');

-- Visit ----------------------------------------------------------------------
--
-- A Visit carries the Place's name into its own text, because "when were we in
-- Jeju?" is a question about a Visit and the word 제주 lives on the Place. The
-- alternative — making recall join — would mean the index is not sufficient
-- on its own, which is the whole point of having one.
create function entry_from_visit() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_place_name text;
begin
  select name into v_place_name from place where id = new.place_id;

  perform entry_put(
    'visit',
    new.id,
    v_place_name,
    entry_text(v_place_name, new.note),
    new.occurred_at,
    new.person_id,
    new.place_id,
    new.journey_id
  );
  return new;
end;
$$;

create trigger entry_from_visit
  after insert or update on visit
  for each row execute function entry_from_visit();

create trigger entry_forget_visit
  after delete on visit
  for each row execute function entry_forget('visit');

-- A Visit's text is copied from its Place, so renaming a Place must refresh
-- the Visits that quoted it — otherwise searching the new name misses them and
-- a rebuild would silently disagree with the triggers. This lives with Visit
-- because it is Visit's copy that goes stale, not Place's row.
create function entry_refresh_visits_of_place() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.name is distinct from old.name then
    update visit set id = id where place_id = new.id;
  end if;
  return new;
end;
$$;

create trigger entry_refresh_visits_of_place
  after update on place
  for each row execute function entry_refresh_visits_of_place();

-- Journey --------------------------------------------------------------------
--
-- A Journey is a named span of our life, not only travel (ADR-0014), so its
-- Entry says nothing about trips and carries no place. `started_on` is when
-- the span began, which is the honest occurred-at for a stretch of time.
--
-- It points at itself as its own journey, so that opening a Journey and
-- listing "everything in this Journey" from the index includes the Journey's
-- own description rather than mysteriously omitting it.
create function entry_from_journey() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform entry_put(
    'journey',
    new.id,
    new.title,
    entry_text(new.title, new.description),
    new.started_on::timestamptz,
    null,
    null,
    new.id
  );
  return new;
end;
$$;

create trigger entry_from_journey
  after insert or update on journey
  for each row execute function entry_from_journey();

create trigger entry_forget_journey
  after delete on journey
  for each row execute function entry_forget('journey');

-- Event ----------------------------------------------------------------------
--
-- An Event's occurred_at is frequently in the future, and that is fine: the
-- calendar reads the index forward from now over the same column the timeline
-- reads backward. Nothing here filters by "past", which would quietly make
-- future Events unrecallable.
--
-- No journey_id: a Journey **adopts** Events by date range and neither creates
-- the other, so a stored link here would be a second answer free to disagree
-- with the dates.
create function entry_from_event() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform entry_put(
    'event',
    new.id,
    new.title,
    entry_text(new.title, new.description),
    new.occurred_at,
    new.person_id,
    new.place_id,
    null
  );
  return new;
end;
$$;

create trigger entry_from_event
  after insert or update on event
  for each row execute function entry_from_event();

create trigger entry_forget_event
  after delete on event
  for each row execute function entry_forget('event');

-- Note -----------------------------------------------------------------------
create function entry_from_note() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform entry_put(
    'note',
    new.id,
    new.title,
    entry_text(new.title, new.body),
    new.occurred_at,
    new.author_id,
    null,
    new.journey_id
  );
  return new;
end;
$$;

create trigger entry_from_note
  after insert or update on note
  for each row execute function entry_from_note();

create trigger entry_forget_note
  after delete on note
  for each row execute function entry_forget('note');

-- ---------------------------------------------------------------------------
-- The rebuild
-- ---------------------------------------------------------------------------

-- Regenerate the entire Entry index from the source tables.
--
-- This is the property that makes ADR-0001's "derived data" claim true rather
-- than aspirational: if Entry can be thrown away and rebuilt exactly, then a
-- bad trigger, a botched backfill or a corrupted index is a repair and not a
-- loss. A test asserts the rebuild is lossless, and that test is the most
-- important one in this ticket.
--
-- It works by re-running the triggers rather than reimplementing them. A
-- second copy of the mapping — one in the trigger, one in the rebuild — would
-- be two things free to drift, and the drift would show up as a rebuild that
-- quietly changes your archive. `update t set id = id` fires each table's own
-- `after update` trigger, so there is exactly one definition of what an Entry
-- for a Letter is, and a new section gets a correct rebuild by writing its
-- trigger and adding one line here.
--
-- Embeddings do not survive a rebuild: they are derived from text by a
-- commercial API, and re-embedding is the app's job on its own schedule. That
-- is the one thing losing an Entry costs, and it is recomputable too.
--
-- Returns the number of Entries the rebuild produced.
create function rebuild_entry_index() returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count bigint;
begin
  delete from entry;

  -- Order does not matter — each trigger is self-contained — but it follows
  -- 002's declaration order so the two files read the same way.
  update letter  set id = id;
  update photo   set id = id;
  update place   set id = id;
  update visit   set id = id;
  update journey set id = id;
  update event   set id = id;
  update note    set id = id;

  select count(*) into v_count from entry;
  return v_count;
end;
$$;

comment on function rebuild_entry_index () is
  'Regenerate the whole Entry index from source tables by re-firing their triggers. Always a safe repair.';

-- A repair operation, not part of the API. Postgres grants EXECUTE to PUBLIC
-- by default, which combined with `security definer` would let any signed-in
-- request rebuild the whole index — safe in outcome but arbitrarily expensive,
-- and it would drop every embedding along the way. Running it is a deliberate
-- act at the database, which is the same stance 001 takes on the allowlist.
revoke execute on function rebuild_entry_index () from public;

-- The per-table trigger functions are likewise not callable directly. They are
-- reached by firing a trigger on a table the caller already has rights to, so
-- taking EXECUTE away costs the app nothing and removes a definer-rights
-- function from the surface a signed-in request can reach.
revoke execute on function entry_put (text, uuid, text, text, timestamptz, uuid, uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- Entry is derived from tables that are already shared between the two of us,
-- so it is readable by whoever is signed in — with one exception that must
-- not be inherited by accident.
--
-- **A sealed Letter's Entry is hidden from its recipient.** The Entry exists,
-- because Entry is derived and hiding rows from the index would make the index
-- disagree with its source; but recall and news read Entry, and a sealed
-- letter surfacing in either would spoil the surprise as completely as opening
-- it. This mirrors `letter_visible` in 002 rather than restating it loosely:
-- the same two conditions, checked against the same clock.
--
-- Nothing may write an Entry through the API. Entries come from triggers, and
-- a hand-written one would be a row a rebuild silently deletes — data that
-- looks stored and is not. Granting only SELECT makes that structurally
-- impossible rather than merely discouraged.
alter table entry enable row level security;

grant select on entry to yaongi_signed_in;

create policy entry_readable on entry
  for select using (
    current_person_id() is not null
    and (
      kind <> 'letter'
      or exists (
        select 1 from letter l
         where l.id = entry.source_id
           and (
             l.author_id = current_person_id()
             or (
               l.recipient_id = current_person_id()
               and (l.unseal_at is null or l.unseal_at <= now())
             )
           )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Adding a source table
-- ---------------------------------------------------------------------------
--
-- Four steps, none of which edits anything another ticket owns. Take your
-- assigned migration number, create your own file, and append:
--
--   1. Your table, in your own migration, with `occurred_at` and no
--      `language` column.
--
--   2. **Your own** trigger function, named `entry_from_<table>`. It calls
--      `entry_put(...)` and nothing else. Copy `entry_from_note` above — it is
--      the smallest one — and change the eight arguments:
--
--        create function entry_from_thing() returns trigger
--        language plpgsql
--        as $$
--        begin
--          perform entry_put(
--            'thing',        -- kind: your table's name
--            new.id,         -- source_id
--            new.title,      -- title, or null
--            entry_text(new.title, new.body),  -- the searchable text
--            new.occurred_at,
--            new.person_id,  -- whose doing it was, or null
--            new.place_id,   -- or null
--            new.journey_id  -- or null
--          );
--          return new;
--        end;
--        $$;
--
--      Do **not** add a branch to somebody else's function, and do not
--      convert these into one dispatcher that switches on kind. Three agents
--      working in parallel would each rewrite it and collide on every merge.
--
--   3. Attach two triggers — yours for writes, the shared one for deletes:
--
--        create trigger entry_from_thing
--          after insert or update on thing
--          for each row execute function entry_from_thing();
--
--        create trigger entry_forget_thing
--          after delete on thing
--          for each row execute function entry_forget('thing');
--
--   4. Add your table to the rebuild, which is the only shared line you touch
--      and is append-only, so it merges as an added line rather than a
--      conflict:
--
--        create or replace function rebuild_entry_index() ...
--
--      — copy the body above, add `update thing set id = id;` to the list.
--      Then extend `tests/entry.test.ts`'s rebuild test, which asserts the
--      rebuild is lossless across every kind. If you add a table and not that
--      line, that test still passes and your section is simply missing from
--      recall — so the test in `tests/rebuild.test.ts` also asserts that every
--      table with an `entry_from_*` trigger appears in the rebuild.
