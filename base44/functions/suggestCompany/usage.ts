// Soft daily cap on suggestCompany: the app is open without login and each call spends Bright Data
// and LLM credits. Pure: the data layer is passed in, so tests run in Node. One UsageCounter record
// per key+day; a race between two callers can overshoot by a call or two, which is acceptable.

export const DAILY_LIMIT = 100;

export interface UsageDb {
  UsageCounter: {
    filter(query: Record<string, unknown>, sort?: string, limit?: number): Promise<unknown>;
    create(data: Record<string, unknown>): Promise<unknown>;
    update(id: string, data: Record<string, unknown>): Promise<unknown>;
  };
}

type Row = { id?: string; count?: number };

export async function takeUsage(db: UsageDb, key: string, day: string, limit = DAILY_LIMIT): Promise<{ allowed: boolean; count: number }> {
  const res = await db.UsageCounter.filter({ key, day }, undefined, 1);
  const row: Row | null = (Array.isArray(res) ? res : (res as { items?: Row[] })?.items || [])[0] || null;
  if (!row) {
    await db.UsageCounter.create({ key, day, count: 1 });
    return { allowed: true, count: 1 };
  }
  const count = typeof row.count === 'number' ? row.count : 0;
  if (count >= limit) return { allowed: false, count };
  if (row.id) await db.UsageCounter.update(row.id, { count: count + 1 });
  return { allowed: true, count: count + 1 };
}
