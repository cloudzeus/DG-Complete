import "server-only";

// Short-lived in-process cache for heavy analyses (payback, stock health, customer insights …):
// the warehouse refreshes every ~15 minutes, so recomputing on every page view is wasted work.
// Concurrent callers share the same pending promise; failures are not cached.

const store = new Map<string, { at: number; value: Promise<unknown> }>();

export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn().catch((err) => {
    store.delete(key);
    throw err;
  });
  store.set(key, { at: Date.now(), value });
  if (store.size > 500) for (const [k, v] of store) if (Date.now() - v.at > ttlMs) store.delete(k);
  return value;
}

export const MEMO_TTL = 15 * 60_000;
