-- 010 — the daily protein counter (PO, 2026-11-01).
--
-- One tap each time either of us eats some protein: "🥚 +1", and today's
-- count. Deliberately a counter and nothing more — no grams, no products, no
-- supplement tracking — so it stays a one-tap habit (the app's north star:
-- simple, easy, record, motivate, get fit together).
--
-- Not in News: a ping every time the other one eats an egg would be the
-- notification bomb the brief rules out.

create table day_protein (
  person_id  uuid not null references person (id) on delete cascade,
  day        date not null,
  servings   integer not null check (servings between 0 and 20),
  updated_at timestamptz not null default now(),
  primary key (person_id, day)
);

comment on table day_protein is
  'How many times each of us had some protein that day. A counter, not a food log.';

alter table day_protein enable row level security;

grant select, insert, update, delete on day_protein to yaongi_signed_in;

-- Both of us see both counts; only you count yours.
create policy day_protein_readable on day_protein
  for select using (current_person_id() is not null);
create policy day_protein_own on day_protein
  for all using (person_id = current_person_id())
  with check (person_id = current_person_id());
