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

test("pgroonga and pgvector are available", async () => {
  const { rows } = await db.query<{ name: string }>(
    `SELECT name FROM pg_available_extensions
     WHERE name IN ('pgroonga', 'vector') ORDER BY name`,
  );
  expect(rows.map((r) => r.name)).toEqual(["pgroonga", "vector"]);
});

test("pgroonga segments Korean where to_tsvector cannot", async () => {
  // The concrete failure ADR-0003 exists to prevent: Korean is agglutinative,
  // so 제주 (Jeju) appears inside 제주도에서 (in Jeju island). Postgres has no
  // Korean text search configuration and would silently find nothing.
  await db.query("CREATE EXTENSION IF NOT EXISTS pgroonga");
  await db.query("CREATE TEMP TABLE probe (body text)");
  await db.query("CREATE INDEX probe_idx ON probe USING pgroonga (body)");
  await db.query("INSERT INTO probe VALUES ('제주도에서 좋은 하루를 보냈어요')");

  const pgroonga = await db.query<{ n: string }>(
    "SELECT count(*) AS n FROM probe WHERE body &@~ '제주'",
  );
  expect(Number(pgroonga.rows[0].n)).toBe(1);

  const tsvector = await db.query<{ n: string }>(
    "SELECT count(*) AS n FROM probe WHERE to_tsvector(body) @@ to_tsquery('제주')",
  );
  expect(Number(tsvector.rows[0].n)).toBe(0);
});
