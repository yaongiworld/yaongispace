-- 006 — Getting a Photo in: the upload queue and the GPS review queue.
--
-- The `photo` and `rendition` tables already exist (002), with the unique
-- `sha256`, the `occurred_at_corrected` correction composed into
-- `occurred_at_effective`, the `deleted_at` tombstone and the EXIF blob. Their
-- Entry trigger already exists (003). **This migration deliberately recreates
-- none of that.** It adds only the two things the import path needs and the
-- schema does not yet have.
--
-- Both are queues, and both exist for the same reason: the import path has two
-- moments where the honest answer is "not yet", and a schema with no way to say
-- so forces the app to lie.
--
--   `import_upload`   the bytes have not arrived. A share of 40 photos on
--                     mobile data after a trip does not finish before the app
--                     is killed, so what remains to be uploaded has to survive
--                     in the database and not only in the page that started it.
--
--   `place_proposal`  the coordinates have not been confirmed. A photo carries
--                     GPS; a Place is a thing we named. **GPS proposes, never
--                     creates** — the alternative is a map dotted with Places
--                     called "37.5665, 126.9780", which is worse than no pin.
--
-- Nothing here rewrites original bytes (ADR-0013): `import_upload` names the
-- key the bytes will be written to exactly once, and is then done forever.

-- ---------------------------------------------------------------------------
-- The upload queue
-- ---------------------------------------------------------------------------

-- One row per original file that has been accepted for import but whose bytes
-- are not yet known to be in R2.
--
-- This is the durable half of the service-worker queue. The service worker
-- keeps its own working copy of the bytes (they cannot go in Postgres — they
-- are the one thing that must never transit our servers, ADR-0012), but *which
-- files were accepted* lives here, so that:
--
--   - killing the app mid-upload loses progress, never the list;
--   - a second device can see that an import is in flight;
--   - a resumed queue asks the database what is still outstanding rather than
--     trusting a client-side list that may be a week stale.
--
-- `photo_id` is null until the upload completes and the Photo row is written.
-- That ordering is deliberate and is what makes the SHA-256 no-op honest: a
-- Photo exists only once its bytes do, so the library never contains a row
-- pointing at an object that was never written.
--
-- `sha256` is *not* unique here, unlike on `photo`. Sharing the same photo
-- twice in two separate imports must not raise — it settles as a no-op when the
-- upload finishes and finds the digest already held. Erroring at enqueue time
-- would surface a duplicate to the user, and the whole point is that they never
-- see one.
create table import_upload (
  id           uuid primary key default gen_random_uuid(),
  -- Who shared it in. The queue is per-Person because the phone that has the
  -- bytes is a particular person's phone.
  person_id    uuid not null references person (id) on delete cascade,
  -- The filename as the phone offered it. Kept only so the review grid and any
  -- later diagnosis have something human to show; nothing keys on it.
  filename     text,
  content_type text not null,
  byte_size    bigint check (byte_size is null or byte_size > 0),
  -- Known once the client has hashed the file, which it does before asking for
  -- an upload URL — that is what lets a duplicate be dropped without spending
  -- the bytes.
  sha256       text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  -- Where the bytes are going. Chosen when the upload is granted, written once.
  storage_key  text unique check (storage_key is null or length(btrim(storage_key)) > 0),

  -- 'queued'    accepted in the review grid, nothing sent yet
  -- 'uploading' a presigned URL has been handed out
  -- 'stored'    the bytes are in R2 and `photo_id` names the Photo
  -- 'duplicate' the digest was already held; a silent no-op, no Photo made
  -- 'failed'    gave up after retries; kept so it can be seen and retried
  --
  -- Free text with a check rather than an enum, matching `rendition.kind`: a
  -- new state should be a line in this constraint, not an ALTER TYPE.
  state        text not null default 'queued'
                 check (state in ('queued', 'uploading', 'stored', 'duplicate', 'failed')),
  -- Why it failed, for the one human who will ever read it.
  error        text,
  attempts     integer not null default 0 check (attempts >= 0),
  photo_id     uuid references photo (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- A finished upload names its Photo; an unfinished one cannot. A 'stored'
  -- row with no `photo_id` would be a queue entry that claims success and
  -- points at nothing, which is exactly the state that makes a queue untrustworthy.
  check ((state = 'stored') = (photo_id is not null))
);

-- What the resumed queue asks for: everything still outstanding, oldest first.
-- Partial, because the settled rows are the overwhelming majority within a week
-- of any import and the queue never looks at them.
create index import_upload_pending_idx on import_upload (person_id, created_at)
  where state in ('queued', 'uploading', 'failed');

create index import_upload_photo_idx on import_upload (photo_id)
  where photo_id is not null;

comment on table import_upload is
  'The durable half of the service-worker upload queue: which files were accepted, so killing the app loses progress and not the list.';

-- An import queue emits **no Entry**. A file waiting to upload is not something
-- that happened in our life — it is an errand. Its Photo emits one the moment
-- it exists, which is the correct moment.

-- ---------------------------------------------------------------------------
-- The GPS review queue
-- ---------------------------------------------------------------------------

-- Coordinates a Photo brought in, waiting for a human to say what they are.
--
-- **GPS proposes, never creates** (the ticket, and the spirit of ADR-0002). A
-- Place is a thing we named and chose to put on the map; EXIF coordinates are a
-- measurement. Turning one into the other automatically would fill the world
-- map with pins named after decimals — and, worse, with pins we never decided
-- to make, which quietly turns the map from *our places* into *everywhere the
-- phone has been*.
--
-- So a proposal is inert. Nothing on the map reads it, no Place exists because
-- of it, and the only two things that can happen to it are that a human accepts
-- it — naming a Place, or attaching the Photo to a Place that already exists —
-- or dismisses it.
--
-- `place_id` is the answer, filled in on acceptance: whichever Place the human
-- decided this proposal meant. Null while the proposal is still open, and null
-- forever if it was dismissed — `resolved_at` is what distinguishes those two.
create table place_proposal (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references photo (id) on delete cascade,
  latitude    double precision not null check (latitude between -90 and 90),
  longitude   double precision not null check (longitude between -180 and 180),
  -- When the photo carrying these coordinates was taken. Deliberately *not*
  -- named `occurred_at`: nothing happened here. A proposal is a question the
  -- app is holding, and `occurred_at` is reserved for things that took place in
  -- our life — the column a test in 003 enumerates precisely so that the axis
  -- does not quietly acquire members that are not memories. This is the
  -- photo's capture time, copied so the queue can be read in the order the
  -- afternoon actually went rather than in whatever order the upload finished.
  photo_occurred_at timestamptz not null,
  -- Who imported the photo, and therefore whose proposal this is to answer.
  person_id   uuid not null references person (id) on delete restrict,
  -- Null while open. Set on accept, still null on dismiss.
  place_id    uuid references place (id) on delete set null,
  -- Null while open. Set on either accept or dismiss: a proposal that has been
  -- looked at never comes back, whichever way it was answered.
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),

  -- One open proposal per Photo. A photo has one set of coordinates, so a
  -- second proposal for it would be the same question asked twice.
  unique (photo_id),

  -- An accepted proposal names the Place it resolved to; so accepting is
  -- impossible without an answer, and a `place_id` cannot be attached to a
  -- proposal still described as open.
  check (place_id is null or resolved_at is not null)
);

-- The queue itself: what is still open, in the order it is reviewed.
create index place_proposal_open_idx on place_proposal (photo_occurred_at desc)
  where resolved_at is null;

comment on table place_proposal is
  'Coordinates a Photo brought in, awaiting a human. GPS proposes, never creates — no Place is named "37.5665, 126.9780".';

comment on column place_proposal.resolved_at is
  'Set on accept *and* on dismiss. A proposal that has been looked at never returns.';

-- A proposal emits **no Entry** either, and this one is worth stating. An Entry
-- is something recall can surface, and a pair of unconfirmed coordinates is not
-- a memory — it is a question the app is holding. Indexing it would put
-- "37.5665, 126.9780" into Recall's answers, which is the same failure as
-- naming a Place after it, arriving by a different door. The Place that comes
-- *out* of a proposal has an Entry, from the trigger 003 already wrote.

-- ---------------------------------------------------------------------------
-- Accepting a proposal
-- ---------------------------------------------------------------------------

-- Answer one proposal: attach the Photo to a Place, creating the Place only if
-- the human supplied a name for a new one.
--
-- In the database rather than the app because it is three writes that must all
-- happen or none — the Place, the Photo's `place_id`, and closing the proposal
-- — and a half-answered proposal is the state that would put the review queue
-- permanently out of step with the map.
--
-- Either `p_place_id` (attach to a Place we already have) or `p_name` (make one)
-- must be given. Passing neither is the *dismiss* case and is a different
-- function, because a dismissal that looks like a typo'd acceptance is how a
-- proposal gets silently thrown away.
--
-- Not `security definer`: everything it writes, the caller may already write
-- under RLS. Definer rights are for the Entry index, which the caller must
-- *not* be able to write; here they would only widen the surface for nothing.
create function accept_place_proposal(
  p_proposal_id uuid,
  p_place_id    uuid default null,
  p_name        text default null
) returns uuid
language plpgsql
as $$
declare
  v_proposal place_proposal%rowtype;
  v_place_id uuid := p_place_id;
begin
  select * into v_proposal from place_proposal where id = p_proposal_id;

  if not found then
    raise exception 'no such place proposal';
  end if;

  if v_proposal.resolved_at is not null then
    raise exception 'this proposal has already been answered';
  end if;

  if v_place_id is null then
    if nullif(btrim(coalesce(p_name, '')), '') is null then
      raise exception 'accepting a proposal needs either a Place to attach to or a name for a new one';
    end if;

    -- The coordinates come from the photo; the *name* is the human's, and that
    -- is the whole distinction this table exists to preserve.
    insert into place (name, latitude, longitude, person_id)
         values (btrim(p_name), v_proposal.latitude, v_proposal.longitude, v_proposal.person_id)
      returning id into v_place_id;
  end if;

  -- The Photo's own trigger re-emits its Entry with the Place attached.
  update photo set place_id = v_place_id where id = v_proposal.photo_id;

  update place_proposal
     set place_id = v_place_id,
         resolved_at = now()
   where id = p_proposal_id;

  return v_place_id;
end;
$$;

comment on function accept_place_proposal (uuid, uuid, text) is
  'Answer a GPS proposal: attach the Photo to a Place, making one only if the human named it.';

-- Dismiss: the coordinates were real and we do not want a pin there. The
-- proposal closes with no Place, and the Photo keeps its latitude and longitude
-- — the measurement was never in doubt, only whether it deserved a name.
create function dismiss_place_proposal(p_proposal_id uuid) returns void
language plpgsql
as $$
begin
  update place_proposal
     set resolved_at = now()
   where id = p_proposal_id
     and resolved_at is null;

  if not found then
    raise exception 'no such open place proposal';
  end if;
end;
$$;

comment on function dismiss_place_proposal (uuid) is
  'Close a GPS proposal without making a Place. The Photo keeps its coordinates.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- Both tables follow 002's shape: the privacy boundary is the front door, not a
-- line between the two of us. Without the grants RLS is never reached — the
-- role has no privilege and every read is a permission error rather than the
-- zero rows a policy would give.

alter table import_upload  enable row level security;
alter table place_proposal enable row level security;

grant select, insert, update, delete on import_upload, place_proposal
  to yaongi_signed_in;

grant execute on function accept_place_proposal (uuid, uuid, text) to yaongi_signed_in;
grant execute on function dismiss_place_proposal (uuid) to yaongi_signed_in;

-- An upload queue is shared to read — seeing that the other person's import is
-- still running is useful and harmless — but only its owner may enqueue or
-- change one. A queue you can write into on somebody else's behalf is a queue
-- that can be made to upload to a key they did not choose.
create policy import_upload_readable on import_upload
  for select using (current_person_id() is not null);

create policy import_upload_own_insert on import_upload
  for insert with check (person_id = current_person_id());

create policy import_upload_own_update on import_upload
  for update using (person_id = current_person_id())
  with check (person_id = current_person_id());

create policy import_upload_own_delete on import_upload
  for delete using (person_id = current_person_id());

-- A proposal is shared outright. Either of us can answer "where is this?" about
-- a photo, and often the one who did not take it is the one who remembers.
create policy place_proposal_shared on place_proposal
  for all using (current_person_id() is not null)
  with check (current_person_id() is not null);
