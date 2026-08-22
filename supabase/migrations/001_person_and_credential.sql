-- 001 — Who may enter, and who they are once they do.
--
-- This migration builds only what signing in needs: a Person, the Credential
-- that lets them sign in, and the allowlist that decides whether they may. The
-- rest of the domain (Letter, Photo, Place, Visit, Journey, Event, Note, and
-- the Entry index over them) belongs to the migrations that follow.
--
-- The vocabulary is CONTEXT.md's, not Supabase's. There is no `users` table: a
-- Person owns everything, and a Google account is only a Credential attached
-- to one (ADR-0006).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Person
-- ---------------------------------------------------------------------------

-- One of us. Exactly two, and deliberately thin — an identity a Letter can be
-- addressed to or a Photo can be about. No contact details and no relationship
-- history; that is the SNS work, which is out of scope.
--
-- `display_name` is what we call each other in the UI (토위, 양초), never a
-- legal name. There is no language column here or anywhere: mixed and
-- code-switched content is the normal case.
create table person (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) > 0),
  created_at   timestamptz not null default now()
);

comment on table person is
  'One of us. Everything in the app belongs to a Person, never to a Google account.';

-- ---------------------------------------------------------------------------
-- The allowlist
-- ---------------------------------------------------------------------------

-- Who may come through the door — as data rather than a hardcoded constant, so
-- admitting a family member or a shared tablet later is a row and not a
-- redeploy.
--
-- A row may name the Person it admits. When `person_id` is null the email is
-- permitted but not yet bound to anybody, and the first sign-in creates the
-- Person and binds it — which is how somebody is invited without us having to
-- invent their Person by hand beforehand.
--
-- Emails are stored and compared lowercased. A case mismatch here would be a
-- lockout that looks exactly like a refusal, which is a miserable thing to
-- debug at the front door.
create table allowed_email (
  email      text primary key check (email = lower(email) and position('@' in email) > 1),
  person_id  uuid references person (id) on delete set null,
  -- Why this address is on the list, for whoever reads this table in 2036.
  note       text,
  created_at timestamptz not null default now()
);

comment on table allowed_email is
  'The door: Google account emails permitted to sign in. Data, not a constant.';

-- ---------------------------------------------------------------------------
-- Credential
-- ---------------------------------------------------------------------------

-- A way for a Person to sign in — currently a Google account, later perhaps an
-- email link or the voice ritual. Attached to a Person and replaceable: losing
-- one loses access, never data (ADR-0006).
--
-- `subject` is the provider's stable identifier — for Google the OAuth `sub`
-- claim, and deliberately not the email address. An email can be changed on a
-- Google account while `sub` never is, so keying on email would silently
-- orphan a Person the day somebody renames their address.
create table credential (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references person (id) on delete cascade,
  provider     text not null default 'google' check (provider in ('google')),
  subject      text not null check (length(btrim(subject)) > 0),
  -- The email as it stood at the last sign-in. Informational only, never the
  -- key, because it can change out from under us.
  email        text not null check (email = lower(email)),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  unique (provider, subject)
);

create index credential_person_idx on credential (person_id);

comment on table credential is
  'A way for a Person to sign in. Keyed on the provider subject, never the email.';

-- ---------------------------------------------------------------------------
-- Signing in
-- ---------------------------------------------------------------------------

-- Resolve a completed Google sign-in to the Person it belongs to, creating
-- neither more nor less than necessary.
--
-- The whole sign-in decision lives in one function in the database on purpose:
-- it has to be atomic. Two devices signing in at the same instant must not
-- race into two Persons for one human, and the unique constraint on
-- (provider, subject) is the only thing that can actually guarantee that. A
-- check-then-insert in application code cannot.
--
-- Returns the Person id, or null when the email is not on the allowlist. Null
-- rather than an exception because refusal is an ordinary outcome the app
-- answers with a warm page — not an error condition.
--
-- The order of the three cases is itself load-bearing:
--
--   1. A known credential wins outright. Signing in twice with the same Google
--      account always resolves to the same Person, and that is settled before
--      the allowlist is consulted so that removing an address from the list
--      can never fork an existing human into a second Person.
--   2. Otherwise the allowlist decides. Not on it, no session.
--   3. An allowlisted email with no credential yet binds to the Person its
--      allowlist row names, or gets a new one.
create function sign_in_with_google(
  p_subject      text,
  p_email        text,
  p_display_name text
) returns uuid
language plpgsql
as $$
declare
  v_email     text := lower(btrim(p_email));
  v_person_id uuid;
  v_allowed   boolean;
begin
  if p_subject is null or length(btrim(p_subject)) = 0 then
    raise exception 'a Google sign-in must carry a subject';
  end if;

  if v_email is null or position('@' in v_email) < 2 then
    raise exception 'a Google sign-in must carry an email';
  end if;

  -- 1. Have we seen this Google account before?
  update credential
     set last_seen_at = now(),
         email        = v_email
   where provider = 'google'
     and subject  = p_subject
  returning person_id into v_person_id;

  if v_person_id is not null then
    return v_person_id;
  end if;

  -- 2. A Google account we have never seen. The allowlist is the door.
  select true, person_id
    into v_allowed, v_person_id
    from allowed_email
   where email = v_email;

  if v_allowed is not true then
    return null;
  end if;

  -- 3. Admitted, and new here. Bind to the Person the allowlist names, or make
  --    one and remember the binding.
  if v_person_id is null then
    insert into person (display_name)
         values (coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)))
      returning id into v_person_id;

    update allowed_email
       set person_id = v_person_id
     where email = v_email;
  end if;

  -- Two devices signing in at the same instant meet here. The unique
  -- constraint catches the loser and both end up on the Person that won.
  insert into credential (person_id, provider, subject, email)
       values (v_person_id, 'google', p_subject, v_email)
  on conflict (provider, subject)
    do update set last_seen_at = now()
    returning person_id into v_person_id;

  return v_person_id;
end;
$$;

comment on function sign_in_with_google (text, text, text) is
  'Resolve a Google sign-in to a Person, or null when the email is not allowlisted.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- The allowlist is the door; RLS is the wall. Sign-in is the one place where a
-- single failed check leaks the entire archive, so two layers are warranted
-- rather than over-engineering.
--
-- `current_person_id()` is the seam every later table's policies key on. It
-- reads the Person id from the request's JWT claims, which the app puts there
-- once `sign_in_with_google` has resolved it. It is defined in this migration
-- rather than the schema one because sign-in is what establishes it.
create function current_person_id() returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'person_id',
      current_setting('request.jwt.claim.person_id', true)
    ),
    ''
  )::uuid;
$$;

comment on function current_person_id () is
  'The signed-in Person, read from the request JWT. The key every RLS policy uses.';

alter table person        enable row level security;
alter table credential    enable row level security;
alter table allowed_email enable row level security;

-- The role a signed-in request runs as. It exists so RLS is something we can
-- actually observe: the owner bypasses every policy, so a wall tested only as
-- the owner is a wall nobody has ever walked into. On hosted Supabase this is
-- the equivalent of `authenticated`, and the app connects as it.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'yaongi_signed_in') then
    create role yaongi_signed_in nologin;
  end if;
  -- So the connecting role can drop into it. Granting membership is what lets
  -- a test — and the app's own request handler — act as a signed-in person
  -- rather than as the owner every policy waves through.
  execute format('grant yaongi_signed_in to %I', current_user);
end;
$$;

grant usage on schema public to yaongi_signed_in;
grant select on person, credential to yaongi_signed_in;
-- Deliberately no grant on allowed_email. The door is not part of the API
-- surface at all, on top of having no policy that would admit a read.

-- We are two people who share everything, so a Person is readable by whoever
-- is signed in. There is no privacy boundary *between* us — the boundary is
-- the front door.
create policy person_readable_when_signed_in on person
  for select using (current_person_id() is not null);

-- A Credential is not shared. It is the key to somebody's account, and only
-- its owner has business reading it.
create policy credential_own on credential
  for select using (person_id = current_person_id());

-- The allowlist is deliberately unreadable through the API. Sign-in consults it
-- inside `sign_in_with_google`, which runs server-side, and nothing in the app
-- ever needs to list who may enter. No policy is declared, so RLS denies
-- everything: editing the door is a deliberate act at the database, not
-- something the app can be talked into.
