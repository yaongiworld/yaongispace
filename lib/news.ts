import type { QueryResultRow } from "pg";
import { asPerson as runAsPerson } from "./as-person";

/**
 * News — what the other one of us has been up to lately.
 *
 * A derived feed, never a stored table (ADR-0015). Nothing in this module
 * writes anything except `see_news()`, which moves one timestamp.
 *
 * **Every query here runs as the signed-in Person**, for the same reason
 * `lib/letters.ts` does and with even less room for error. A sealed Letter's
 * Entry is hidden by migration 003's `entry_readable` policy, and a policy
 * only applies to a caller it applies to — query as the database owner and
 * every seal in the archive is bypassed silently. The `news` view is declared
 * `security_invoker` so that it reads `entry` as whoever selected from it;
 * that option and the `SET LOCAL ROLE` below are two halves of one mechanism
 * and neither works alone.
 *
 * So this module composes no visibility rules of its own. There is no
 * `where unseal_at is null or ...` anywhere below, deliberately: that rule
 * lives once, in the database, and a second copy here would be free to
 * disagree with it.
 *
 * **Nothing here writes `read_at`, and nothing here calls `open_letter()`.**
 * Seeing a Letter in News is not reading it — only opening the Letter itself
 * seals it. A read Letter is immutable, so a feed that sealed on sight would
 * permanently lock letters their author could still have fixed, and it would
 * do so while looking like a tidy simplification.
 */

/** One thing the other person did. */
export interface NewsItem {
  entryId: string;
  /** `letter`, `photo`, `visit`, `event`, `note`, … */
  kind: string;
  /** The row it came from, for linking to the thing itself. */
  sourceId: string;
  title: string | null;
  text: string;
  personId: string;
  /** 토위 or 양초 — what the feed calls them. */
  personName: string;
  journeyId: string | null;
  journeyTitle: string | null;
  /** When it arrived. The axis News sorts on — never `occurred_at`. */
  arrivedAt: Date;
  /** True for an Event whose occurrence is within the next seven days. */
  imminent: boolean;
  /** When an imminent Event actually lands. Null for everything else. */
  occursAt: Date | null;
}

/**
 * A line in the feed.
 *
 * News collapses: seven photos from one afternoon are one line, not seven.
 * A group is either a Journey — "제주, 10월" — or a single day, and a Letter
 * is never either (see `collapse` below).
 */
export interface NewsGroup {
  /** Stable across renders: the Journey id, or the day, plus the kind. */
  key: string;
  /** What this group collapsed on. A Letter is always `alone`. */
  by: "journey" | "day" | "alone";
  /** The Journey this group is, when it is one. */
  journeyTitle: string | null;
  /** Newest first. A group of one is the common case. */
  items: NewsItem[];
  /** The newest arrival in the group — what the feed sorts on. */
  arrivedAt: Date;
}

interface NewsRow {
  entry_id: string;
  kind: string;
  source_id: string;
  title: string | null;
  text: string;
  person_id: string;
  person_name: string;
  journey_id: string | null;
  journey_title: string | null;
  arrived_at: Date;
  imminent: boolean;
  occurs_at: Date | null;
}

type QueryFn = <R>(
  sql: string,
  values?: unknown[],
) => Promise<{ rows: R[]; rowCount: number | null }>;

/**
 * Run `body` as `personId`, with RLS enforced.
 *
 * The same shape as `lib/letters.ts`'s `asPerson`, and load-bearing for the
 * same reasons: the JWT claim is what `current_person_id()` reads, and
 * `SET LOCAL ROLE` is what makes the policies apply at all — the owner is
 * waved through every one of them, so setting the claim without dropping the
 * role would be theatre. `LOCAL` scopes both to the transaction so a pooled
 * connection cannot leak one request's identity into the next.
 */
async function asPerson<T>(
  personId: string,
  body: (query: QueryFn) => Promise<T>,
): Promise<T> {
  return runAsPerson(personId, (client) =>
    body(((sql: string, values?: unknown[]) => client.query(sql, values)) as QueryFn),
  );
}

/**
 * The feed, newest arrival first.
 *
 * The join to `imminent_event` is why an Event nearly here is news at all.
 * **Reading `event.occurred_at` would be wrong**: a 2016 anniversary is news
 * in November 2026, and that is invisible from the stored row — the repeat has
 * to be projected first, which is what ticket 07's view does. It carries
 * `entry_id`, so this joins the index it already reads rather than growing a
 * second code path for Events. Its original-date column is `stored_on`, not
 * `occurred_at`, and nothing here reads it: News does not reason in
 * occurred-at.
 *
 * A left join, so an ordinary Event that is merely recent still appears as
 * news in the normal way; `imminent` marks the ones that are also *coming up*.
 */
const SELECT_NEWS = `
  SELECT n.entry_id, n.kind, n.source_id, n.title, n.text,
         n.person_id, n.person_name, n.journey_id, n.journey_title,
         n.arrived_at,
         (i.entry_id IS NOT NULL) AS imminent,
         i.occurs_at
    FROM news n
    LEFT JOIN imminent_event i ON i.entry_id = n.entry_id
   ORDER BY n.arrived_at DESC
`;

const toItem = (row: NewsRow): NewsItem => ({
  entryId: row.entry_id,
  kind: row.kind,
  sourceId: row.source_id,
  title: row.title,
  text: row.text,
  personId: row.person_id,
  personName: row.person_name,
  journeyId: row.journey_id,
  journeyTitle: row.journey_title,
  arrivedAt: row.arrived_at,
  imminent: row.imminent,
  occursAt: row.occurs_at,
});

/** Every piece of News this Person can see, collapsed into lines. */
export async function newsFor(personId: string): Promise<NewsGroup[]> {
  const items = await asPerson(personId, async (query) => {
    const { rows } = await query<NewsRow>(SELECT_NEWS);
    return rows.map(toItem);
  });
  return collapse(items);
}

/**
 * Mark News seen.
 *
 * The only write in this module, and it moves one timestamp. Deliberately
 * separate from `newsFor` rather than folded into it: rendering the home page
 * and dismissing what is on it are different acts, and a read that also
 * dismissed would mean News could never be looked at twice.
 */
export async function seeNews(personId: string): Promise<Date | null> {
  return asPerson(personId, async (query) => {
    const { rows } = await query<{ see_news: Date | null }>("SELECT see_news()");
    return rows[0]?.see_news ?? null;
  });
}

/** When this Person last looked. Null means they never have. */
export async function newsSeenAt(personId: string): Promise<Date | null> {
  return asPerson(personId, async (query) => {
    const { rows } = await query<{ news_seen_at: Date | null }>(
      "SELECT news_seen_at FROM person WHERE id = $1",
      [personId],
    );
    return rows[0]?.news_seen_at ?? null;
  });
}

/**
 * Collapse the feed: by Journey where one exists, else by day.
 *
 * Seven photos from one afternoon in Jeju are one line. Without this the
 * hearth becomes a scroll, which is the dashboard the home page is explicitly
 * not.
 *
 * **A Letter is never grouped.** Two letters on one day are two lines, and a
 * letter inside a Journey is still its own line. A letter is a composed,
 * addressed thing — the one piece of news that is always worth its own
 * sentence — and collapsing two of them into "편지 2통" would flatten exactly
 * the thing the app exists for. This is the rule most likely to be "tidied"
 * later by someone grouping uniformly; it is a decision, not an oversight.
 *
 * Grouping is within a kind as well as within a day: a photo and a visit on
 * the same afternoon are different sentences even though they share a bucket.
 */
export function collapse(items: NewsItem[]): NewsGroup[] {
  const groups = new Map<string, NewsGroup>();

  for (const item of items) {
    const key = groupKey(item);

    // A Letter gets a key unique to itself, so it can never join anything.
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      // Items arrive newest-first, so the first one seen is the newest.
      continue;
    }

    groups.set(key, {
      key,
      by: item.kind === "letter" ? "alone" : item.journeyId ? "journey" : "day",
      journeyTitle: item.kind === "letter" ? null : item.journeyTitle,
      items: [item],
      arrivedAt: item.arrivedAt,
    });
  }

  return [...groups.values()].sort(
    (a, b) => b.arrivedAt.getTime() - a.arrivedAt.getTime(),
  );
}

/** What a piece of news collapses onto. */
function groupKey(item: NewsItem): string {
  // Never grouped — its own key, always.
  if (item.kind === "letter") return `letter:${item.sourceId}`;
  if (item.journeyId) return `journey:${item.journeyId}:${item.kind}`;
  return `day:${seoulDay(item.arrivedAt)}:${item.kind}`;
}

/**
 * The calendar day something arrived on, in Seoul.
 *
 * Pinned rather than taken from the server, for the same reason
 * `lib/korean-date.ts` pins it: a server grouping in UTC would split a Seoul
 * evening across two days, so photos taken after 9pm would appear as two lines
 * instead of one. Both of us live in Korea.
 */
function seoulDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
