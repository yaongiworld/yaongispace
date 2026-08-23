import { afterAll, beforeAll, expect, test } from "vitest";
import type { Client } from "pg";
import { connect } from "./db";

/**
 * The harness proves itself.
 *
 * Ticket 01 has no schema yet, so there is nothing of ours to test. What
 * these assertions protect is the *ability* to test what comes next: if the
 * database is missing pgroonga or pgvector, every later ticket's tests would
 * pass against a database that cannot do what production does.
 */

let db: Client;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db?.end();
});

test("the test database is reachable", async () => {
  const { rows } = await db.query<{ ok: number }>("SELECT 1 AS ok");
  expect(rows[0].ok).toBe(1);
});

test("pg_trgm and pgvector are available", async () => {
  // The two the app actually requires. Deliberately *not* pgroonga: it does
  // better Korean segmentation but exists on Supabase and almost nowhere else,
  // so requiring it here would mean the test suite only passes on hosts that
  // cost $25/month. Both of these ship with stock Postgres.
  const { rows } = await db.query<{ name: string }>(
    `SELECT name FROM pg_available_extensions
     WHERE name IN ('pg_trgm', 'vector') ORDER BY name`,
  );
  expect(rows.map((r) => r.name)).toEqual(["pg_trgm", "vector"]);
});

test("trigram search finds Korean where to_tsvector cannot", async () => {
  // The concrete failure ADR-0003 exists to prevent: Korean is agglutinative,
  // so 제주 (Jeju) appears inside 제주도에서 (in Jeju island). Postgres has no
  // Korean text search configuration and would silently find nothing.
  //
  // Trigrams have no notion of a word, which is exactly why they survive here:
  // the trigrams of 제주도에서 include those of 제주.
  await db.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await db.query("CREATE TEMP TABLE probe (body text)");
  await db.query("CREATE INDEX probe_idx ON probe USING gin (body gin_trgm_ops)");
  await db.query("INSERT INTO probe VALUES ('제주도에서 좋은 하루를 보냈어요')");

  const trigram = await db.query<{ n: string }>(
    "SELECT count(*) AS n FROM probe WHERE body ILIKE '%제주%'",
  );
  expect(Number(trigram.rows[0].n)).toBe(1);

  const tsvector = await db.query<{ n: string }>(
    "SELECT count(*) AS n FROM probe WHERE to_tsvector(body) @@ to_tsquery('제주')",
  );
  expect(Number(tsvector.rows[0].n)).toBe(0);
});
