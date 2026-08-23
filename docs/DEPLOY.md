# Deploying Yaongispace

Vercel for the app, Supabase for Postgres and auth, Cloudflare R2 for photo
bytes — settled in [ticket 011](../.wayfinder/tickets/011-hosting-and-storage.md)
and [ADR-0012](adr/0012-r2-for-photo-storage.md). This is the *how*.

Domain: **yaongiworld.com**.

Roughly $25/month for Supabase Pro plus ~$7 at 500GB of photos. Vercel's free
tier covers two people.

## Order matters

Each step needs a value from the one before it. Doing them out of order mostly
works and then fails at sign-in with nothing in the logs.

### 1. Supabase — Postgres and auth

Create a project in **ap-northeast-2 (Seoul)**; both of you are in Korea and it
is the difference between a snappy app and a sluggish one.

**Pro plan is required, not a preference.** Two reasons, either sufficient:

- **pgroonga is not available on the free tier.** Postgres cannot tokenize
  Korean — `to_tsvector` on 제주도에서 silently matches nothing — so Recall and
  every Korean search depend on it ([ADR-0003](adr/0003-pgroonga-for-korean-search.md)).
- The free tier **pauses after a week of inactivity**. For an app opened a few
  times a week that is a cold start every visit.

Then, in the SQL editor:

```sql
create extension if not exists pgroonga;
create extension if not exists vector;
```

Take **two** connection strings from Project Settings → Database:

| | Port | Used by |
|---|---|---|
| Pooler (transaction mode) | 6543 | the app — `DATABASE_URL` |
| Direct | 5432 | migrations — `MIGRATION_DATABASE_URL` |

**This distinction is load-bearing.** `lib/db.ts` opens a raw `pg` Pool, and on
Vercel every serverless instance opens its own — Supabase's direct connection
limit is low enough that the app will exhaust it the first time both of you use
it at once. Migrations need the opposite: DDL inside a transaction is not what a
transaction-mode pooler is for.

### 2. Cloudflare R2 — photo bytes

Create a bucket (`yaongi-photos`) and an **R2 API token** scoped to it —
Object Read & Write, not an account-wide key.

Note the **account ID** and the token's key pair. `R2_SCHEME`, `R2_REGION`,
`R2_PUBLIC_HOST` and `R2_INTERNAL_HOST` are for local MinIO only: leave all four
unset in production.

**CORS is required**, and its absence looks like a broken app rather than a
config error: the browser PUTs originals straight to R2, so without it every
upload fails in the browser while the server logs stay clean.

```json
[
  {
    "AllowedOrigins": ["https://yaongiworld.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type", "content-length"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

### 3. Google OAuth — the real redirect URI

In the existing Cloud console client, **add** (do not replace — keep localhost
so development still works):

```
https://yaongiworld.com/auth/callback
```

Scopes stay **`email` and `profile` only**. Adding a sensitive scope brings
verification, CASA and a 7-day refresh-token fuse with it
([ADR-0005](adr/0005-google-for-sign-in-only.md)).

While the consent screen is in **Testing**, both accounts must be listed under
**Test users** or Google refuses before the app ever sees the request.

### 4. Vercel — the app

Import the repo. Framework preset Next.js; everything else default.

Environment variables (Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **pooler**, port 6543 |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `GOOGLE_CLIENT_ID` | from the Cloud console |
| `GOOGLE_CLIENT_SECRET` | from the Cloud console |
| `GOOGLE_REDIRECT_URI` | `https://yaongiworld.com/auth/callback` |
| `NEXT_PUBLIC_SITE_URL` | `https://yaongiworld.com` |
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | R2 token key |
| `R2_SECRET_ACCESS_KEY` | R2 token secret |
| `R2_BUCKET` | `yaongi-photos` |

`SESSION_SECRET` is the only logout this app has: sessions never expire by
decision, so rotating it signs both of you out everywhere.

Add the domain under Settings → Domains and point DNS at Vercel.

### 5. GitHub — the migration secret

Repository → Settings → Secrets → Actions:

- `MIGRATION_DATABASE_URL` — the **direct** connection string, port 5432

`.github/workflows/ci.yml` then applies pending migrations on every push to
`main`, before the new code serves. It is idempotent: already-applied files are
skipped, so a push with no new migration does nothing.

For the very first deploy, run it once by hand so the schema exists before
anyone visits:

```sh
DATABASE_URL='<direct connection string>' npm run migrate
```

### 6. The allowlist — or nobody can sign in

**This is the step that is easy to miss and locks you out of your own app.** The
allowlist is a table, not a constant, precisely so that admitting somebody later
is a row rather than a redeploy — but it means an empty table admits nobody. The
dev seed does not run in production.

In the Supabase SQL editor:

```sql
insert into person (display_name) values ('토위'), ('양초');

insert into allowed_email (email, person_id, note)
select 'taekang1618@gmail.com', id, '토위' from person where display_name = '토위';

insert into allowed_email (email, person_id, note)
select '<양초 google address>', id, '양초' from person where display_name = '양초';
```

Emails are stored lowercase and matched against what Google returns in the
`id_token` — which is the address the *Google account* uses, not necessarily the
one you usually write to. A mismatch presents as the warm Korean refusal, which
looks identical to not being invited.

## After the first deploy, check these four

1. **Sign in** as each of you. A refusal means the allowlist does not match what
   Google returned.
2. **Write a letter** to the other. Seals, appears in the other's letterbox, and
   in News on the home page.
3. **Import a photo** from a phone's share sheet. If it fails in the browser but
   the server logs are clean, it is CORS on the bucket.
4. **Search Korean** — a partial word like 제주 against a letter containing
   제주도에서. If it finds nothing, pgroonga is missing.

## Known gaps that reach production

From [SPEC-GAPS.md](../.scratch/skeleton/SPEC-GAPS.md), the ones that matter live:

- **EXIF is JPEG-only, so HEIC arrives bare.** HEIC is the iPhone default, so
  양초's photos import with no capture date, no GPS and an empty blob, silently.
  Worth fixing before importing anything you care about: re-reading originals
  out of R2 later to recover a field is the one-way door ticket 08 warns about.
- **R2 itself has still never been contacted.** The storage path is exercised
  against MinIO, which speaks the same S3 API and the same SigV4 — that found
  and fixed three real bugs — but R2's own quirks are still ahead.
- A Photo cannot be deleted; captions cannot be written; the last-seen marker
  does not yet trim News.
