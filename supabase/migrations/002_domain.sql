-- 002 — The things themselves.
--
-- Letter, Photo, Rendition, Place, Visit, Journey, Event, Note: the eight
-- honest tables the sections write to. Person and Credential already exist
-- from 001; nothing here changes them.
--
-- The Entry index over these tables is 003. This file deliberately knows
-- nothing about Entry — the source tables are the truth, Entry is derived
-- from them (ADR-0001), and keeping the dependency pointing one way means a
-- section can be understood without reading the index.
--
-- The vocabulary is CONTEXT.md's and it is exact. There is no `user`, no
-- `album`, no `moment`, no `trip`.
--
-- Two conventions run through every table here:
--
--   `occurred_at` is when a thing happened in our life; `created_at` is when
--   it was put into the app. A letter written today about Jeju last October
--   occurred in October. Every timeline, map and recall query reasons in
--   occurred_at, so it is a column in its own right and never inferred from
--   created_at.
--
--   There is no `language` column anywhere. Mixed and code-switched content is
--   the normal case, and pgroonga handles both halves in one field (ADR-0003).

-- ---------------------------------------------------------------------------
-- Journey
-- ---------------------------------------------------------------------------

-- A named span of our life that gathers the Photos, Visits, Events and Letters
-- belonging to it — "Jeju, October 2025", "이사", "the year we got married".
--
-- Travel is the commonest kind of Journey, not the definition of one
-- (ADR-0014). There is deliberately no `kind`, no `is_trip`, and no Place
-- reference: the moment a Journey has to be a trip, a wedding and a house move
-- need a second grouping noun, which is the vocabulary rot CONTEXT.md exists
-- to prevent.
--
-- The span is `started_on`/`ended_on` as dates rather than timestamps, because
-- a Journey is remembered in days, not minutes. `ended_on` is nullable: a
-- Journey you are still in has not ended.
--
-- A Journey is optional everywhere. The timeline is the substrate; Journeys
-- are lenses over it, and a Photo in no Journey is a first-class Photo.
create table journey (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) > 0),
  description text,
  started_on  date not null,
  ended_on    date,
  created_at  timestamptz not null default now(),

  check (ended_on is null or ended_on >= started_on)
);

create index journey_span_idx on journey (started_on, ended_on);

comment on table journey is
  'A named span of our life, not only of travel (ADR-0014). Always optional.';

-- ---------------------------------------------------------------------------
-- Place
-- ---------------------------------------------------------------------------

-- A location on the world map. It exists whether or not we have been there:
-- **a Place with no Visit is a wish** (ADR-0002). There is no `status`, no
-- `is_wished`, no `visited` boolean — that flag drifts, and having a Visit is
-- what makes a Place somewhere we have been.
--
-- Coordinates are plain numerics rather than PostGIS. Two people pinning
-- places on a map need distance-to-a-point at most, which is arithmetic; a
-- geometry type would be a dependency bought for nothing.
create table place (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  -- What we want to remember about it, including why we want to go.
  note       text,
  latitude   double precision check (latitude between -90 and 90),
  longitude  double precision check (longitude between -180 and 180),
  -- Who put the pin on the map.
  person_id  uuid not null references person (id) on delete restrict,
  created_at timestamptz not null default now(),

  -- Either both coordinates or neither. A half-located pin cannot be drawn and
  -- would be a silent hole in the map rather than a visible one.
  check ((latitude is null) = (longitude is null))
);

create index place_person_idx on place (person_id);

comment on table place is
  'A location on the map. A Place with no Visit is a wish — there is no status flag.';

-- ---------------------------------------------------------------------------
-- Visit
-- ---------------------------------------------------------------------------

-- An occasion when we were at a Place. Three trips to Jeju are three Visits to
-- one Place, which is why this is a table and not a column on `place`.
--
-- `occurred_at` is when we were there. That is the whole point of the row.
create table visit (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references place (id) on delete cascade,
  journey_id  uuid references journey (id) on delete set null,
  person_id   uuid not null references person (id) on delete restrict,
  note        text,
  occurred_at timestamptz not null,
  created_at  timestamptz not null default now()
);

create index visit_place_idx on visit (place_id);
create index visit_occurred_idx on visit (occurred_at desc);
create index visit_journey_idx on visit (journey_id) where journey_id is not null;

comment on table visit is
  'An occasion at a Place. Its existence is what makes a Place somewhere we have been.';

-- ---------------------------------------------------------------------------
-- Letter
-- ---------------------------------------------------------------------------

-- A written message from one of us to the other. Composed rather than fired
-- off — length and ceremony are what separate it from a chat message.
--
-- Three timestamps that are genuinely three different things:
--
--   `occurred_at`  what the letter is *about*. Defaults to now at the app
--                  layer, but a letter written today about last October
--                  carries October.
--   `unseal_at`    when it may be opened. Null is an ordinary letter. A sealed
--                  letter is invisible — not counted down to — until this
--                  passes, and its News fires on this date (ADR-0015).
--   `read_at`      when the recipient actually opened it. Reading a Letter is
--                  what seals it; *seeing it mentioned in News is not*, and
--                  collapsing the two would silently lock letters their writer
--                  could still have fixed.
--
-- `design` is a decorative treatment key. It never carries text: generated
-- Hangul is garbled and these are keepsakes.
create table letter (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references person (id) on delete restrict,
  recipient_id uuid not null references person (id) on delete restrict,
  journey_id   uuid references journey (id) on delete set null,
  title        text,
  body         text not null check (length(btrim(body)) > 0),
  design       text,
  occurred_at  timestamptz not null default now(),
  unseal_at    timestamptz,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),

  -- A letter to yourself is a Note, and the distinction is the whole reason
  -- both nouns exist: a Letter is addressed, a Note is not.
  check (author_id <> recipient_id)
);

create index letter_recipient_idx on letter (recipient_id, occurred_at desc);
create index letter_occurred_idx on letter (occurred_at desc);
create index letter_journey_idx on letter (journey_id) where journey_id is not null;

comment on table letter is
  'A written message from one of us to the other. Addressed, unlike a Note.';

-- ---------------------------------------------------------------------------
-- Photo
-- ---------------------------------------------------------------------------

-- An image or video we chose to keep, imported into our own storage. Ours, not
-- a reference to somebody else's copy.
--
-- The original bytes are **write-once** (ADR-0013). Nothing in this table is a
-- path that gets rewritten in place: `storage_key` points at the bytes exactly
-- as imported, forever. Rotation and cropping become a Rendition; a wrong
-- date becomes `occurred_at_corrected`; a delete becomes `deleted_at`. Every
-- operation the app offers is additive, so the worst a bug can do is produce a
-- bad derivative — the thing it was derived from is still there.
--
-- `occurred_at` is EXIF's capture time where there is one, falling back to the
-- import time so the column is never null and the timeline never has holes.
-- `occurred_at_corrected` is the stored correction: display composes the two
-- rather than overwriting, which is why it is a separate column and why
-- `occurred_at_effective` below is what everything else reads.
--
-- `sha256` is unique: an exact duplicate import is a silent no-op, not an
-- error and not a second row. Near-duplicate review is deliberately not built.
--
-- The full EXIF blob is kept as JSON beside the few fields worth querying.
-- Extracting more later is then a migration over data we already hold, rather
-- than a re-import of 139GB we no longer have in hand.
create table photo (
  id                    uuid primary key default gen_random_uuid(),
  -- Where the original bytes live in R2 (ADR-0012). Write-once.
  storage_key           text not null unique check (length(btrim(storage_key)) > 0),
  sha256                text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  content_type          text not null,
  byte_size             bigint check (byte_size is null or byte_size > 0),
  width                 integer check (width is null or width > 0),
  height                integer check (height is null or height > 0),
  -- What we wrote about it. The only text a Photo contributes to recall:
  -- Recall reads captions and metadata, never the photograph itself.
  caption               text,
  occurred_at           timestamptz not null,
  -- A correction, never an overwrite of the line above.
  occurred_at_corrected timestamptz,
  latitude              double precision check (latitude between -90 and 90),
  longitude             double precision check (longitude between -180 and 180),
  place_id              uuid references place (id) on delete set null,
  journey_id            uuid references journey (id) on delete set null,
  -- Who imported it.
  person_id             uuid not null references person (id) on delete restrict,
  exif                  jsonb not null default '{}'::jsonb,
  -- A tombstone, not an erasure (ADR-0013).
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),

  check ((latitude is null) = (longitude is null))
);

-- The capture time everything else should read: the correction when there is
-- one, the imported value otherwise. Generated rather than left to each caller
-- so that "which timestamp did you mean" is answered once, in the schema.
alter table photo
  add column occurred_at_effective timestamptz
  generated always as (coalesce(occurred_at_corrected, occurred_at)) stored;

create index photo_occurred_idx on photo (occurred_at_effective desc);
create index photo_journey_idx on photo (journey_id) where journey_id is not null;
create index photo_place_idx on photo (place_id) where place_id is not null;
create index photo_person_idx on photo (person_id);

comment on table photo is
  'One we picked. Original bytes are never rewritten (ADR-0013); the library is curated, not complete.';

comment on column photo.occurred_at_effective is
  'The capture time to read: the stored correction, else the imported value.';

-- ---------------------------------------------------------------------------
-- Rendition
-- ---------------------------------------------------------------------------

-- A derived version of a Photo — a thumbnail, a display size, a rotated copy.
-- Generated once at import and stored beside the original, never in place of
-- it. Rebuildable from the original, so losing one costs nothing.
--
-- Renditions emit no Entry. They carry no text and no time of their own; a
-- thumbnail is not a separate thing that happened in our life, and indexing
-- one would put five copies of every photo in front of Recall.
create table rendition (
  id           uuid primary key default gen_random_uuid(),
  photo_id     uuid not null references photo (id) on delete cascade,
  -- 'thumb', 'display', 'rotated' — free text on purpose. An enum here would
  -- need a migration the first time sharp learns a new size.
  kind         text not null check (length(btrim(kind)) > 0),
  storage_key  text not null unique check (length(btrim(storage_key)) > 0),
  content_type text not null,
  width        integer check (width is null or width > 0),
  height       integer check (height is null or height > 0),
  byte_size    bigint check (byte_size is null or byte_size > 0),
  created_at   timestamptz not null default now(),

  unique (photo_id, kind)
);

create index rendition_photo_idx on rendition (photo_id);

comment on table rendition is
  'A derived version of a Photo. Rebuildable, so losing one costs nothing.';

-- ---------------------------------------------------------------------------
-- Event
-- ---------------------------------------------------------------------------

-- Something on our shared calendar — an anniversary, a trip, a thing to look
-- forward to. Native to Yaongispace: ours, not a mirror of Google Calendar.
--
-- `occurred_at` is when it happens, future or past. The calendar is an agenda
-- rather than a grid, so it reads forward from now over the same column the
-- timeline reads backward over.
--
-- Recurrence is `repeats_yearly`, a flag, not RRULE. Everything we actually
-- repeat is an anniversary, and a full recurrence engine is a subsystem bought
-- to express "every year on this day".
--
-- There is no journey_id: a Journey **adopts** Events by date range, and
-- neither creates the other. A stored link would be a second answer to the
-- same question, free to disagree with the dates.
create table event (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (length(btrim(title)) > 0),
  description    text,
  occurred_at    timestamptz not null,
  ends_at        timestamptz,
  -- An all-day thing has no meaningful clock time; the UI must not invent one.
  all_day        boolean not null default false,
  repeats_yearly boolean not null default false,
  place_id       uuid references place (id) on delete set null,
  -- Who put it on the calendar. The calendar itself is shared.
  person_id      uuid not null references person (id) on delete restrict,
  created_at     timestamptz not null default now(),

  check (ends_at is null or ends_at >= occurred_at)
);

create index event_occurred_idx on event (occurred_at);
create index event_person_idx on event (person_id);

comment on table event is
  'Something on our shared calendar. Native, never a mirror of Google Calendar.';

-- ---------------------------------------------------------------------------
-- Note
-- ---------------------------------------------------------------------------

-- Something written down for ourselves rather than to each other — the
-- knowledge base Recall draws on. A Letter is addressed; a Note is not.
--
-- Freeform by design: a title and a body, nothing typed and nothing required
-- beyond the body. No tags, no folders, no notebook. Recall is how a Note is
-- found again, which is exactly why the Entry index has to be automatic.
create table note (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references person (id) on delete restrict,
  journey_id  uuid references journey (id) on delete set null,
  title       text,
  body        text not null check (length(btrim(body)) > 0),
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index note_author_idx on note (author_id);
create index note_occurred_idx on note (occurred_at desc);
create index note_journey_idx on note (journey_id) where journey_id is not null;

comment on table note is
  'Written for ourselves, not to each other. A Letter is addressed; a Note is not.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- The allowlist is the door; RLS is the wall. Every table here carries a
-- policy keyed on `current_person_id()` — the seam 001 established, and the
-- only mechanism. A second way to say "who is this" would be a second way to
-- get it wrong.
--
-- The shape of these policies follows from *two people who share everything*:
-- the privacy boundary is the front door, not a line between us. So a signed-
-- in Person reads everything, and the only per-row ownership rules are about
-- **authorship**, where they are about not rewriting each other's words rather
-- than about secrecy.
--
-- The one genuine exception is a sealed Letter, which its recipient must not
-- read early. That is enforced here rather than in a query, because a
-- forgotten `where` clause in the app would spoil a surprise permanently and
-- there would be nothing to roll back.

alter table journey   enable row level security;
alter table place     enable row level security;
alter table visit     enable row level security;
alter table letter    enable row level security;
alter table photo     enable row level security;
alter table rendition enable row level security;
alter table event     enable row level security;
alter table note      enable row level security;

-- Without these grants RLS is not even reached: the role simply has no
-- privilege, and every read comes back as a permission error rather than the
-- zero rows a policy would give. Both are refusals, but only one is the one we
-- meant.
grant select, insert, update, delete on
  journey, place, visit, letter, photo, rendition, event, note
  to yaongi_signed_in;

-- Journey, Place, Visit, Photo, Rendition, Event: shared outright.
create policy journey_shared on journey
  for all using (current_person_id() is not null)
  with check (current_person_id() is not null);

create policy place_shared on place
  for all using (current_person_id() is not null)
  with check (current_person_id() is not null);

create policy visit_shared on visit
  for all using (current_person_id() is not null)
  with check (current_person_id() is not null);

create policy photo_shared on photo
  for all using (current_person_id() is not null)
  with check (current_person_id() is not null);

create policy rendition_shared on rendition
  for all using (current_person_id() is not null)
  with check (current_person_id() is not null);

create policy event_shared on event
  for all using (current_person_id() is not null)
  with check (current_person_id() is not null);

-- A Note is written for ourselves. Both of us read the knowledge base — that
-- is what makes it shared — but only its author edits it, so neither of us can
-- quietly rewrite what the other wrote down.
create policy note_readable on note
  for select using (current_person_id() is not null);

create policy note_written_by_author on note
  for insert with check (author_id = current_person_id());

create policy note_edited_by_author on note
  for update using (author_id = current_person_id())
  with check (author_id = current_person_id());

create policy note_deleted_by_author on note
  for delete using (author_id = current_person_id());

-- A Letter is readable by the two people it is between, and by nobody else —
-- which today is everybody, but stating it as authorship rather than "anyone
-- signed in" is what keeps the row honest if a third Person ever exists.
--
-- **A sealed letter is invisible to its recipient until it unseals.** Not
-- greyed out, not counted down to: absent, because a countdown leaks the
-- surprise. The author still sees their own sealed letter — they wrote it, and
-- they may still be editing it.
create policy letter_visible on letter
  for select using (
    author_id = current_person_id()
    or (
      recipient_id = current_person_id()
      and (unseal_at is null or unseal_at <= now())
    )
  );

create policy letter_written_by_author on letter
  for insert with check (author_id = current_person_id());

-- The author may edit their letter; the recipient may only mark it read. Both
-- go through UPDATE, and separating them at the SQL level would mean a
-- function per field — so the policy admits the recipient and the trigger
-- below is what stops them from touching anything except `read_at`.
create policy letter_updated_by_either on letter
  for update using (
    author_id = current_person_id()
    or (
      recipient_id = current_person_id()
      and (unseal_at is null or unseal_at <= now())
    )
  )
  with check (
    author_id = current_person_id()
    or recipient_id = current_person_id()
  );

create policy letter_deleted_by_author on letter
  for delete using (author_id = current_person_id());

-- Reading a Letter is what seals it, and a sealed letter is immutable — the
-- seal is load-bearing, so it is enforced here rather than trusted to the app.
-- Two rules, both of which a `where` clause could forget:
--
--   1. Once read, the words are fixed. You cannot revise a letter after it has
--      been read, which is what makes a letter a letter.
--   2. A recipient's only power is to mark it read. They cannot edit the body,
--      unseal it early, or unread it.
create function letter_stays_what_it_was() returns trigger
language plpgsql
as $$
begin
  if old.read_at is not null and (
       new.body        is distinct from old.body
    or new.title       is distinct from old.title
    or new.design      is distinct from old.design
    or new.occurred_at is distinct from old.occurred_at
    or new.unseal_at   is distinct from old.unseal_at
  ) then
    raise exception 'a Letter that has been read cannot be rewritten';
  end if;

  -- Unreading would let a recipient reopen the author's editing window, which
  -- is the seal running backwards.
  if old.read_at is not null and new.read_at is null then
    raise exception 'a Letter that has been read cannot be unread';
  end if;

  if current_person_id() = old.recipient_id
     and current_person_id() <> old.author_id then
    if new.body        is distinct from old.body
    or new.title       is distinct from old.title
    or new.design      is distinct from old.design
    or new.occurred_at is distinct from old.occurred_at
    or new.unseal_at   is distinct from old.unseal_at
    or new.author_id   is distinct from old.author_id
    or new.recipient_id is distinct from old.recipient_id
    or new.journey_id  is distinct from old.journey_id then
      raise exception 'a Letter''s recipient may only mark it read';
    end if;
  end if;

  return new;
end;
$$;

create trigger letter_stays_what_it_was
  before update on letter
  for each row execute function letter_stays_what_it_was();

comment on function letter_stays_what_it_was () is
  'The seal: a read Letter is immutable, and its recipient may only mark it read.';
