import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Client } from "pg";
import { asPerson, migrate } from "./db";
import { reset, twoPeople } from "./world";

/**
 * The wall, observed from inside it.
 *
 * Every assertion here runs through `asPerson`, which drops to
 * `yaongi_signed_in` — because the owner these tests connect as bypasses every
 * policy, so a policy could be written backwards and a test run as the owner
 * would still pass. **A test that checks RLS as the owner is a test of
 * nothing.**
 *
 * These also assert that RLS *denies*, not that the app avoids asking. The
 * difference matters: a query the app never writes is not a boundary, it is a
 * habit, and the point of the wall is that it holds when somebody writes the
 * query anyway.
 */

let db: Client;
let towee: string;
let yangcho: string;

beforeAll(async () => {
  db = await migrate();
});

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await reset(db);
  ({ towee, yangcho } = await twoPeople(db));
});

const count = async (sql: string, params: unknown[] = []) => {
  const { rows } = await db.query<{ n: string }>(sql, params);
  return Number(rows[0].n);
};

test("a stranger who is not signed in sees nothing at all", async () => {
  await db.query("INSERT INTO note (author_id, body) VALUES ($1, '비밀 메모')", [towee]);
  await db.query(
    "INSERT INTO letter (author_id, recipient_id, body) VALUES ($1, $2, '잘 자')",
    [towee, yangcho],
  );
  await db.query(
    "INSERT INTO place (name, person_id) VALUES ('제주도', $1)",
    [towee],
  );

  // `null` is what an unauthenticated request is: no person_id claim at all.
  await asPerson(db, null, async () => {
    expect(await count("SELECT count(*) AS n FROM note")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM letter")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM place")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM entry")).toBe(0);
  });
});

test("a signed-in Person sees the shared archive", async () => {
  // The privacy boundary is the front door, not a line between the two of us.
  await db.query("INSERT INTO place (name, person_id) VALUES ('제주도', $1)", [towee]);
  await db.query("INSERT INTO journey (title, started_on) VALUES ('이사', '2026-03-01')");

  await asPerson(db, yangcho, async () => {
    expect(await count("SELECT count(*) AS n FROM place")).toBe(1);
    expect(await count("SELECT count(*) AS n FROM journey")).toBe(1);
  });
});

test("a sealed Letter is invisible to its recipient until it unseals", async () => {
  // Not greyed out and not counted down to: absent. A countdown leaks the
  // surprise, which is the whole thing being protected.
  await db.query(
    `INSERT INTO letter (author_id, recipient_id, body, unseal_at)
     VALUES ($1, $2, '10년 뒤에 읽어줘', '2036-01-01T00:00:00Z')`,
    [towee, yangcho],
  );

  await asPerson(db, yangcho, async () => {
    expect(await count("SELECT count(*) AS n FROM letter")).toBe(0);
    // And not through the index either, which is what recall and news read.
    expect(await count("SELECT count(*) AS n FROM entry WHERE kind = 'letter'")).toBe(0);
  });

  // The author still sees their own: they wrote it and may still be editing it.
  await asPerson(db, towee, async () => {
    expect(await count("SELECT count(*) AS n FROM letter")).toBe(1);
    expect(await count("SELECT count(*) AS n FROM entry WHERE kind = 'letter'")).toBe(1);
  });
});

test("a Letter whose unseal date has passed is visible to its recipient", async () => {
  await db.query(
    `INSERT INTO letter (author_id, recipient_id, body, unseal_at)
     VALUES ($1, $2, '생일 축하해', now() - interval '1 day')`,
    [towee, yangcho],
  );

  await asPerson(db, yangcho, async () => {
    expect(await count("SELECT count(*) AS n FROM letter")).toBe(1);
    expect(await count("SELECT count(*) AS n FROM entry WHERE kind = 'letter'")).toBe(1);
  });
});

test("a Letter cannot be written in somebody else's name", async () => {
  await asPerson(db, yangcho, async () => {
    await expect(
      db.query(
        "INSERT INTO letter (author_id, recipient_id, body) VALUES ($1, $2, '가짜')",
        [towee, yangcho],
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

test("a recipient may mark a Letter read but not rewrite it", async () => {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO letter (author_id, recipient_id, body) VALUES ($1, $2, '원래 쓴 말') RETURNING id",
    [towee, yangcho],
  );
  const id = rows[0].id;

  // While it is still unread — so it is the recipient rule being tested here,
  // not the read-immutability rule, which would otherwise deny first and mask it.
  await asPerson(db, yangcho, async () => {
    await expect(
      db.query("UPDATE letter SET body = '내가 고친 말' WHERE id = $1", [id]),
    ).rejects.toThrow(/recipient may only mark it read/i);
  });

  await asPerson(db, yangcho, async () => {
    // Allowed: reading it is the recipient's one power over it.
    const marked = await db.query("UPDATE letter SET read_at = now() WHERE id = $1", [id]);
    expect(marked.rowCount).toBe(1);
  });

  // Nor may they unseal one early to get at it.
  await asPerson(db, yangcho, async () => {
    await expect(
      db.query("UPDATE letter SET unseal_at = now() WHERE id = $1", [id]),
    ).rejects.toThrow(/recipient may only mark it read/i);
  });
});

test("a Letter that has been read cannot be rewritten, even by its author", async () => {
  // The seal is load-bearing: a letter is editable until read, then fixed.
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO letter (author_id, recipient_id, body) VALUES ($1, $2, '처음 쓴 편지') RETURNING id",
    [towee, yangcho],
  );
  const id = rows[0].id;

  await asPerson(db, towee, async () => {
    // Before it is read, the author may still fix it.
    await db.query("UPDATE letter SET body = '고쳐 쓴 편지' WHERE id = $1", [id]);
  });

  await db.query("UPDATE letter SET read_at = now() WHERE id = $1", [id]);

  await asPerson(db, towee, async () => {
    await expect(
      db.query("UPDATE letter SET body = '몰래 고친 편지' WHERE id = $1", [id]),
    ).rejects.toThrow(/cannot be rewritten/i);
  });

  // And it cannot be un-read to reopen that window. A separate transaction,
  // because the failure above aborted the last one.
  await asPerson(db, towee, async () => {
    await expect(
      db.query("UPDATE letter SET read_at = NULL WHERE id = $1", [id]),
    ).rejects.toThrow(/cannot be unread/i);
  });
});

test("only a Note's author may edit or delete it", async () => {
  // Both of us read the knowledge base — that is what makes it shared — but
  // neither of us can quietly rewrite what the other wrote down.
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO note (author_id, body) VALUES ($1, '토위가 쓴 메모') RETURNING id",
    [towee],
  );
  const id = rows[0].id;

  await asPerson(db, yangcho, async () => {
    expect(await count("SELECT count(*) AS n FROM note WHERE id = $1", [id])).toBe(1);

    // RLS filters the row out of the UPDATE rather than raising: zero rows
    // changed, and the note is untouched.
    const updated = await db.query("UPDATE note SET body = '고침' WHERE id = $1", [id]);
    expect(updated.rowCount).toBe(0);

    const deleted = await db.query("DELETE FROM note WHERE id = $1", [id]);
    expect(deleted.rowCount).toBe(0);
  });

  const after = await db.query<{ body: string }>("SELECT body FROM note WHERE id = $1", [id]);
  expect(after.rows[0].body).toBe("토위가 쓴 메모");
});

test("a Note cannot be written in somebody else's name", async () => {
  await asPerson(db, yangcho, async () => {
    await expect(
      db.query("INSERT INTO note (author_id, body) VALUES ($1, '가짜 메모')", [towee]),
    ).rejects.toThrow(/row-level security/i);
  });
});

test("nobody can write an Entry by hand", async () => {
  // Entries come from triggers. A hand-written one would be a row the next
  // rebuild silently deletes — data that looks stored and is not — so the
  // grant makes it impossible rather than merely discouraged.
  // A failed statement aborts the surrounding transaction, so each attempt
  // needs its own — otherwise the second only ever sees "transaction is
  // aborted" and would pass without proving anything.
  await asPerson(db, towee, async () => {
    await expect(
      db.query(
        `INSERT INTO entry (kind, source_id, text, occurred_at)
         VALUES ('note', gen_random_uuid(), '손으로 쓴 항목', now())`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  await asPerson(db, towee, async () => {
    await expect(db.query("DELETE FROM entry")).rejects.toThrow(/permission denied/i);
  });

  await asPerson(db, towee, async () => {
    await expect(db.query("UPDATE entry SET text = '고침'")).rejects.toThrow(
      /permission denied/i,
    );
  });
});

test("a signed-in Person cannot rebuild the index or call entry_put directly", async () => {
  // The trigger functions run with definer rights so the index can be
  // maintained without the app holding INSERT on `entry`. That makes them
  // worth keeping off the reachable surface: a rebuild is a deliberate act at
  // the database, and `entry_put` is reached by writing to a source table.
  await asPerson(db, towee, async () => {
    await expect(db.query("SELECT rebuild_entry_index()")).rejects.toThrow(
      /permission denied/i,
    );
  });

  await asPerson(db, towee, async () => {
    await expect(
      db.query(
        "SELECT entry_put('note', gen_random_uuid(), null, '몰래', now(), null, null, null)",
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

test("a signed-in Person can record a Visit and a Photo", async () => {
  // The wall must not be so tight that the app cannot do its job — the other
  // half of getting RLS right, and the half a deny-everything policy passes.
  await asPerson(db, towee, async () => {
    const place = await db.query<{ id: string }>(
      "INSERT INTO place (name, person_id) VALUES ('부산', $1) RETURNING id",
      [towee],
    );
    await db.query(
      "INSERT INTO visit (place_id, person_id, occurred_at) VALUES ($1, $2, now())",
      [place.rows[0].id, towee],
    );
    await db.query(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
       VALUES ('r2/busan.jpg', repeat('f', 64), 'image/jpeg', now(), $1)`,
      [towee],
    );

    // And the triggers ran for them under RLS, exactly as for the owner.
    expect(await count("SELECT count(*) AS n FROM entry WHERE kind = 'visit'")).toBe(1);
    expect(await count("SELECT count(*) AS n FROM entry WHERE kind = 'photo'")).toBe(1);
  });
});

test("the allowlist stays unreadable through the API", async () => {
  // 001's decision, re-asserted now that more tables exist: the door is not
  // part of the API surface at all.
  await db.query("INSERT INTO allowed_email (email) VALUES ('towee@example.com')");
  await asPerson(db, towee, async () => {
    await expect(db.query("SELECT * FROM allowed_email")).rejects.toThrow(
      /permission denied/i,
    );
  });
});
