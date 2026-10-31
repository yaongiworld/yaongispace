import { addDays, type Day } from "@/lib/today/day";

/**
 * The Moments grid (brief §4, 충돌 2): one month, weeks Monday-first, padded
 * with the neighbouring months' days so every row is a full week.
 */

export type Month = string; // "YYYY-MM"

export function monthOf(day: Day): Month {
  return day.slice(0, 7);
}

export function isMonth(v: unknown): v is Month {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function shiftMonth(month: Month, n: number): Month {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(month: Month): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}년 ${m}월`;
}

export interface Cell {
  day: Day;
  inMonth: boolean;
}

/** The grid's cells, 5 or 6 rows of 7. */
export function monthGrid(month: Month): Cell[][] {
  const first = `${month}-01`;
  const dow = new Date(`${first}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const start = addDays(first, -((dow + 6) % 7));
  const next = `${shiftMonth(month, 1)}-01`;

  const rows: Cell[][] = [];
  let day = start;
  while (day < next || rows.length === 0) {
    const row: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      row.push({ day, inMonth: day.startsWith(month) });
      day = addDays(day, 1);
    }
    rows.push(row);
  }
  return rows;
}

/** The first and last day the grid shows. */
export function gridRange(month: Month): { from: Day; to: Day } {
  const g = monthGrid(month);
  return { from: g[0][0].day, to: g[g.length - 1][6].day };
}
