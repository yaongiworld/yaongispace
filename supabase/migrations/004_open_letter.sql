-- 004 — Opening a Letter is what seals it.
--
-- 002 built the `letter` table, its RLS, and `letter_stays_what_it_was()` —
-- the trigger that makes a read Letter immutable and limits its recipient to
-- setting `read_at`. 003 built `entry_from_letter`. This migration adds no
-- table and repeats none of that. It closes the two gaps that stand between
-- what 002 built and what the Letters section actually promises.
--
-- **Gap one: anybody could set `read_at`, including the author.**
--
-- 002's trigger constrains *what* a recipient may change; nothing constrained
-- *who* may perform the sealing. So the author could set `read_at` on their
-- own letter — and since a read Letter is immutable, an author who opened
-- their own draft to reread it would lock themselves out of it permanently,
-- with the recipient never having seen a word. There is no undo for that: the
-- letter is fixed in whatever half-finished state it was in.
--
-- Reading is per-Person and load-bearing. **Only the recipient opening the
-- Letter seals it.** The author looking at their own writing is not a reading
-- in the sense that matters, any more than seeing the letter mentioned in News
-- is — and these are all the same distinction, which is why the rule is stated
-- once here rather than trusted to each caller.
--
-- **Gap two: `read_at` could be moved after the fact.**
--
-- A recipient could re-open a Letter and overwrite when they read it. The seal
-- is a fact about the past, and one that its author's editing window depends
-- on; letting it move is the seal running sideways rather than backwards, and
-- 002 only forbade backwards.
--
-- The fix for both is `open_letter()` — one function that is the only way the
-- app marks a Letter read, plus a trigger that refuses any other route. The
-- app never writes `read_at` in a query it composes itself, because a
-- forgotten condition there spoils something with no way back.

-- ---------------------------------------------------------------------------
-- The seal
-- ---------------------------------------------------------------------------

-- Open a Letter as the signed-in Person, marking it read if — and only if —
-- this is its recipient opening it for the first time.
--
-- Returns the moment the Letter was sealed — the *first* opening, never a
-- later one, so calling it again on a letter already read gives back the
-- original timestamp rather than null. The app renders "읽음" from this, and a
-- function that answered null on the second call would make a read letter look
-- unread every time after the first.
--
-- Returns null only when the Letter is not sealed by this opening at all: the
-- Person is its author, it is still sealed until a date, or it is not theirs.
-- Null rather than an exception because none of those is an error — an author
-- opening their own letter is the ordinary act of rereading what you wrote,
-- and the app renders the letter either way.
--
-- Deliberately **not** `security definer`. Every other definer function in
-- this schema exists because the caller must not hold the privilege it uses
-- (writing `entry` by hand is the thing that must be impossible). Here the
-- opposite is true: the caller *is* the recipient and RLS is exactly what
-- should decide whether they may see this row. Running as the owner would
-- bypass `letter_visible` and hand back sealed letters to anyone who guessed
-- an id — turning the one function that protects the surprise into the one
-- that leaks it. So it runs as the caller, and the invisible row is simply
-- not found.
create function open_letter(p_letter_id uuid) returns timestamptz
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_read_at timestamptz;
begin
  -- RLS applies here, so a Letter still sealed until its date is not there to
  -- be found and a Letter belonging to neither of us never was. Both cases
  -- fall through to null having changed nothing.
  update letter
     set read_at = now()
   where id = p_letter_id
     and recipient_id = current_person_id()
     and read_at is null
  returning read_at into v_read_at;

  if v_read_at is not null then
    return v_read_at;
  end if;

  -- Nothing was sealed. Either it was already read — in which case the honest
  -- answer is when — or this opening does not seal it, which is null.
  select read_at into v_read_at
    from letter
   where id = p_letter_id
     and recipient_id = current_person_id();

  return v_read_at;
end;
$$;

comment on function open_letter (uuid) is
  'Open a Letter as the signed-in Person. Seals it only when its recipient opens it, and only the first time.';

-- ---------------------------------------------------------------------------
-- The only way in
-- ---------------------------------------------------------------------------

-- `open_letter` is the app's route to `read_at`, and this is what makes it the
-- *only* route rather than merely the intended one. A rule that lives only in
-- the function is a rule the next hand-written `UPDATE letter SET read_at`
-- walks straight past — and the whole reason the seal is in the database is
-- that the app forgetting it once is unrecoverable.
--
-- Three refusals, none of which 002 already covers:
--
--   1. The author cannot seal their own Letter. 002 stops the *recipient* from
--      touching anything but `read_at`; nothing stopped the author touching
--      `read_at` itself.
--   2. `read_at` cannot be moved once set. 002 forbids un-reading (null); this
--      forbids the sideways move to a different timestamp.
--   3. `read_at` cannot be set to a time that is not now. A letter read
--      "yesterday" or "next year" is a false fact about our own history, and
--      the archive is meant to last decades.
--
-- The owner is deliberately exempt from the first rule only insofar as
-- `current_person_id()` is null for them: a migration, a repair or a restore
-- runs with no signed-in Person and must be able to write historical rows.
-- That is the same stance 002 takes — the wall is for the app, not for the
-- hand at the database.
create function letter_is_sealed_by_its_reader() returns trigger
language plpgsql
as $$
begin
  if new.read_at is distinct from old.read_at then
    -- No signed-in Person: a migration or a repair at the database itself.
    if current_person_id() is null then
      return new;
    end if;

    -- Un-reading is 002's rule and 002 states it better ("cannot be unread").
    -- Deferring rather than restating keeps one message per broken rule: this
    -- trigger fires first on name order, so raising here would shadow 002's
    -- wording for a case it already owns. Falling through lets
    -- `letter_stays_what_it_was` refuse it, as it always has.
    if new.read_at is null then
      return new;
    end if;

    if old.read_at is not null then
      raise exception 'when a Letter was read is not something that can be changed';
    end if;

    if current_person_id() <> old.recipient_id then
      raise exception 'only a Letter''s recipient can open it';
    end if;

    -- `open_letter` sets it to now(). Anything else is a composed UPDATE
    -- asserting a reading that did not happen when it says it did.
    if new.read_at is distinct from now() then
      raise exception 'a Letter is read when it is opened, not at a chosen time';
    end if;
  end if;

  return new;
end;
$$;

-- Postgres fires BEFORE triggers in name order, so this one runs before 002's
-- `letter_is_sealed_by_its_reader` < `letter_stays_what_it_was`. The order is
-- not load-bearing: the two functions refuse disjoint things, neither depends
-- on the other having run, and a rejection from either aborts the statement.
-- It is only worth knowing because it decides *which message* you see when an
-- update breaks both rules at once.
create trigger letter_is_sealed_by_its_reader
  before update on letter
  for each row execute function letter_is_sealed_by_its_reader();

comment on function letter_is_sealed_by_its_reader () is
  'Only the recipient opening a Letter seals it, only the first time, and only at the moment it happens.';

-- ---------------------------------------------------------------------------
-- Nothing is added to the Entry index
-- ---------------------------------------------------------------------------
--
-- Worth stating, because 003's "Adding a source table" recipe is four steps
-- and this migration follows none of them — which will look like an omission
-- to whoever reads this next.
--
-- It is not one. This migration adds **no source table**: `letter` already
-- exists, `entry_from_letter` already registers its Entry, and
-- `rebuild_entry_index()` already carries `update letter set id = id`. There is
-- nothing to append, and appending a second `entry_from_letter` would mean two
-- functions writing one Entry.
--
-- Opening a Letter fires `entry_from_letter` again, because it is an UPDATE.
-- That is correct and cheap: `entry_put` upserts, the text has not changed so
-- the embedding survives, and the Entry stays exactly as it was. A sealed
-- Letter's Entry is likewise untouched here — it is hidden from its recipient
-- by 003's `entry_readable` policy, not by being absent, so a rebuild agrees
-- with the triggers (ADR-0001).
