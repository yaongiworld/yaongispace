-- 007 — News: the feed is derived, the seen marker is stored.
--
-- ADR-0015. News is **a query over recent Entries**, not a notifications
-- table, and this migration is careful to add nothing that looks like one:
-- no news rows, no per-item read flags, no backfill, nothing written when a
-- Letter or an Event is created. What it adds is one column on `person` and
-- two readings of the Entry index.
--
-- The split is the whole point and it is easy to get wrong in either
-- direction. Deriving *everything* is the tempting simplification, and it is
-- broken: `entry` is itself derived and `rebuild_entry_index()` deletes and
-- re-creates every row in it (003). If "have I seen this?" were computed from
-- the Entry, a rebuild — a *repair* — would hand you back every piece of news
-- you had already dismissed. So the feed is derived and the seen marker is
-- stored, and the marker is one timestamptz because that is all durability is
-- needed for.
--
-- The cost of one marker rather than one row per item is that dismissal is
-- all-or-nothing: you cannot keep one item unseen and drop another. ADR-0015
-- takes that trade deliberately — per-item state is the stored table this
-- design rejects, and for two people marking things individually is a chore.

-- ---------------------------------------------------------------------------
-- The one stored thing
-- ---------------------------------------------------------------------------

-- When this Person last looked at News.
--
-- Nullable, and null means "has never looked", which is different from "looked
-- at the epoch": a Person who has never opened the app sees the whole rolling
-- window rather than nothing. A `default now()` would have been the other
-- reading and it is wrong — it would silently swallow everything that arrived
-- before the column existed.
alter table person add column news_seen_at timestamptz;

comment on column person.news_seen_at is
  'When this Person last looked at News. The only thing News stores (ADR-0015).';

-- ---------------------------------------------------------------------------
-- How long a window
-- ---------------------------------------------------------------------------

-- News is a rolling ~30 days, not a history.
--
-- The window is here rather than as a literal in the query because it is a
-- statement about what News *is* — "a window, not a history" — and the
-- timeline, the Journey and Recall are where history lives. A single
-- definition also means the feed and any later count badge cannot disagree
-- about how far back they look.
create function news_window() returns interval
language sql
immutable
as $$ select interval '30 days' $$;

comment on function news_window () is
  'How far back News looks. A rolling window, never a history (ADR-0015).';

-- ---------------------------------------------------------------------------
-- When a piece of news arrived
-- ---------------------------------------------------------------------------

-- **News orders by arrival, and this is the only place in Yaongispace that
-- does not reason in `occurred_at`.**
--
-- Two cases force it (ADR-0015): a Letter written today *about* last October
-- carries `occurred_at` in October and would sort into the past instead of
-- appearing as news; and a Takeout backfill imports four years of Photos whose
-- `occurred_at` spans four years, which under occurred-at ordering buries the
-- feed in 2022.
--
-- So the axis is `created_at` — but **the source row's, never the Entry's**,
-- and that distinction is the subtlest thing in this file.
--
-- `entry.created_at` looks like the obvious column and it is a trap. An Entry
-- is derived: `rebuild_entry_index()` deletes every row and re-inserts it, and
-- `entry.created_at` defaults to `now()`, so after a repair every Entry in the
-- archive claims to have been created at the moment of the repair. Ordering
-- News by it would mean a rebuild silently re-dates four years of history into
-- today's feed — the exact "a repair undoes your dismissals" failure ADR-0015
-- stores the seen marker to prevent, arriving by a second road the ADR does
-- not mention. The source row's `created_at` is the durable one: nothing
-- rewrites `letter.created_at`, and a rebuild does not touch it.
--
-- Then one adjustment, for the sealed Letter. A Letter sealed until 2036 was
-- *created* today, and its news fires on its unseal date, not now.
-- `greatest(created_at, unseal_at)` is that rule, and it is a `greatest`
-- rather than a `coalesce` so an already-unsealed letter is unaffected: a
-- letter sealed until yesterday is news today, from the moment it arrived.
--
-- `unseal_at` lives on `letter`, not on `entry` — the index carries no seal,
-- because 003 hides a sealed letter's Entry through `entry_readable` rather
-- than by withholding the row. Both mechanisms are needed and they do
-- different jobs: RLS makes a sealed letter *invisible*, and this makes an
-- unsealed one *sort where it belongs*. Without this a letter sealed for ten
-- years would appear in ten years at the very bottom of the feed, dated today.
--
-- A kind with no source `created_at` to read falls back to the Entry's own,
-- which is the honest answer for something the index is the only record of.
-- Every kind in the schema today has one; the `coalesce` is what keeps a
-- future kind from vanishing from the feed rather than merely sorting oddly.
create function news_arrived_at(p_kind text, p_source_id uuid, p_created_at timestamptz)
returns timestamptz
language sql
stable
as $$
  select coalesce(
    case p_kind
      when 'letter' then (
        -- The seal moves a Letter's arrival forward to its unseal date.
        select greatest(l.created_at, coalesce(l.unseal_at, l.created_at))
          from letter l where l.id = p_source_id
      )
      when 'photo'   then (select ph.created_at from photo   ph where ph.id = p_source_id)
      when 'place'   then (select pl.created_at from place   pl where pl.id = p_source_id)
      when 'visit'   then (select v.created_at  from visit   v  where v.id  = p_source_id)
      when 'journey' then (select j.created_at  from journey j  where j.id  = p_source_id)
      when 'event'   then (select ev.created_at from event   ev where ev.id = p_source_id)
      when 'note'    then (select n.created_at  from note    n  where n.id  = p_source_id)
    end,
    p_created_at
  );
$$;

comment on function news_arrived_at (text, uuid, timestamptz) is
  'When a piece of news arrived. created_at, except a sealed Letter, whose news fires on its unseal date (ADR-0015).';

-- ---------------------------------------------------------------------------
-- The feed
-- ---------------------------------------------------------------------------

-- What the other one of us has been up to lately.
--
-- A view, because News is derived. Nothing writes here and there is nothing to
-- write to — every row is computed from `entry` on read.
--
-- Three rules are enforced here and one is deliberately not:
--
--   * **`person_id <> current_person_id()`.** News is always someone else's
--     doing; you never see your own actions reflected back at you. An Entry
--     with a null `person_id` — a Place, a Journey — is nobody's doing in
--     particular and is not news either, which is why the comparison is a
--     plain `<>` and not `is distinct from`.
--
--   * **The rolling window**, from `news_window()`.
--
--   * **Ordering by arrival**, from `news_arrived_at()`.
--
-- What is *not* here is the seal. This view reads `entry`, and a sealed
-- Letter's Entry is already invisible to its recipient through 003's
-- `entry_readable` policy — but **only when queried as the signed-in Person**.
-- Queried as the owner every seal is bypassed and this view would cheerfully
-- hand back a letter sealed until 2036. That is why `lib/news.ts` runs
-- `SET LOCAL ROLE` exactly as `lib/letters.ts` does, and why there is no
-- second `where unseal_at is null or ...` here: a second copy of the rule
-- would be free to disagree with the first.
--
-- Equally absent: anything that writes `read_at`. **Seeing a Letter in News is
-- not reading it.** Only `open_letter()` seals a Letter, 004's trigger refuses
-- every other route, and this view is a `select` — feed-read and letter-read
-- are two separate notions and collapsing them would look like a tidy
-- simplification while silently sealing letters their author could still have
-- fixed.
-- **`security_invoker` is what makes the seal hold, and without it this view
-- is a hole straight through it.**
--
-- A Postgres view reads its base tables as the view's *owner*, not as the
-- caller. This view is owned by `postgres`, who has `rolbypassrls` — so
-- without this option `entry_readable` is evaluated as the owner, every policy
-- is waived, and `select * from news` hands a Person the Entry of a Letter
-- sealed until 2036. Measured, not assumed: selecting from `entry` directly as
-- `yaongi_signed_in` returned 0 rows while selecting from this view returned
-- 1, from the same transaction.
--
-- That is the worst possible failure for this app. It is silent, it looks
-- correct in every test written as the owner, and what it leaks is precisely
-- the thing that has no undo — a surprise, spoiled once and forever.
--
-- `security_invoker = true` makes the view read `entry` as whoever selected
-- from it, so the policy applies exactly as it does to a direct select and
-- this file needs no seal logic of its own. It pairs with the `SET LOCAL ROLE`
-- in `lib/news.ts`: the option decides *whose* rights are used, the role
-- decides *which* rights those are, and both are required. Querying this view
-- as the owner still bypasses everything, which is why the app never does.
create view news with (security_invoker = true) as
  select e.id                                              as entry_id,
         e.kind,
         e.source_id,
         e.title,
         e.text,
         e.person_id,
         p.display_name                                    as person_name,
         e.journey_id,
         j.title                                           as journey_title,
         -- **No `occurred_at` here, deliberately.** News is the one thing in
         -- Yaongispace that does not reason in occurred-at, so a News row
         -- carrying one would be offering exactly the column that must not be
         -- used to sort it — and the day somebody orders this view by the
         -- obvious field, a letter about last October quietly sinks into last
         -- October. `arrived_at` is the only time axis a News row has.
         --
         -- A schema test asserts precisely which relations carry an
         -- `occurred_at`, because it is the primary axis everywhere else and a
         -- stray one is how the axis gets forked without anybody deciding to.
         -- Ticket 07's `imminent_event` names its equivalent `stored_on` for
         -- the same reason. If the home page ever needs the real date of a
         -- News item, it reads it from `entry` by `entry_id`.
         news_arrived_at(e.kind, e.source_id, e.created_at) as arrived_at
    from entry e
    join person p on p.id = e.person_id
    left join journey j on j.id = e.journey_id
   where e.person_id <> current_person_id()
     and news_arrived_at(e.kind, e.source_id, e.created_at) <= now()
     and news_arrived_at(e.kind, e.source_id, e.created_at) > now() - news_window();

comment on view news is
  'What the other one of us has been up to lately. Derived from Entries, ordered by arrival, never stored (ADR-0015).';

grant select on news to yaongi_signed_in;
grant execute on function news_window () to yaongi_signed_in;
grant execute on function news_arrived_at (text, uuid, timestamptz) to yaongi_signed_in;

-- ---------------------------------------------------------------------------
-- Looking at it
-- ---------------------------------------------------------------------------

-- Mark News seen, and hand back the moment it was marked.
--
-- `security definer` because a signed-in Person holds only SELECT on `person`
-- (001) — and that is worth keeping. Granting UPDATE on the table so that the
-- home page can move one timestamp would also grant the ability to rename
-- either of us. So the privilege is lent to this one function, which can move
-- exactly one column of exactly one row: the caller's own.
--
-- `current_person_id()` rather than a parameter, deliberately. A `p_person_id`
-- argument on a definer-rights function is an invitation to mark the *other*
-- person's news seen, which would quietly hide from Yangcho something she had
-- never looked at. The caller cannot name anybody but themselves.
--
-- Moving forward only. A page that renders twice, or an old tab that posts
-- late, must not drag the marker backwards and resurrect news that was already
-- dismissed — the same failure a rebuild would cause, arriving by a different
-- road.
create function see_news() returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seen timestamptz;
begin
  if current_person_id() is null then
    return null;
  end if;

  update person
     set news_seen_at = greatest(now(), coalesce(news_seen_at, now()))
   where id = current_person_id()
  returning news_seen_at into v_seen;

  return v_seen;
end;
$$;

comment on function see_news () is
  'Mark News seen for the signed-in Person. The only write News performs (ADR-0015).';

revoke execute on function see_news () from public;
grant execute on function see_news () to yaongi_signed_in;

-- ---------------------------------------------------------------------------
-- Nothing is added to the Entry index
-- ---------------------------------------------------------------------------
--
-- Worth saying, because 003's "Adding a source table" recipe is four steps and
-- this migration follows none of them.
--
-- That is correct: News adds **no source table**. It is a reading of the index
-- that already exists, so there is no `entry_from_news`, no trigger, and
-- nothing to append to `rebuild_entry_index()`. If a future session finds
-- itself writing one, the derived feed has become a stored table and ADR-0015
-- has been reversed by accident.
--
-- The column added above is on `person`, which has no Entry of its own — a
-- Person is who things belong to, not a thing that happened.
