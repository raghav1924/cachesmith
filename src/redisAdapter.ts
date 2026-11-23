/**
 * CacheSmith Redis Distributed Adapter
 * Extends XFetch probabilistic early expiration to remote Redis / KeyDB clusters.
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import { CacheEntry, CacheLookupResult, CacheStrategy } from './types.js';

export interface RedisClientContract {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<string | null>;
}

export class RedisCacheAdapter {
  constructor(private client: RedisClientContract) {}

  async getXFetch<T>(key: string, beta = 1.0): Promise<CacheLookupResult<T>> {
    const raw = await this.client.get(key);
    if (!raw) {
      return {
        status: 'MISS',
        value: null,
        ageSeconds: 0,
        remainingTtlSeconds: 0,
        shouldRecomputeEarly: true,
        headers: { 'X-Cache': 'MISS', 'Age': '0' }
      };
    }

    const entry: CacheEntry<T> = JSON.parse(raw);
    const now = Date.now();
    const ageMs = now - entry.createdAt;
    const remainingMs = entry.ttlMs - ageMs;

    const u = Math.max(0.0001, Math.random());
    const deltaMs = entry.deltaComputationMs || 50;
    const xfetchThreshold = now - (beta * deltaMs * Math.log(u));
    const expiryTimestamp = entry.createdAt + entry.ttlMs;

    const shouldRecomputeEarly = xfetchThreshold > expiryTimestamp;

    return {
      status: remainingMs > 0 ? (shouldRecomputeEarly ? 'REVALIDATED' : 'HIT') : 'STALE',
      value: entry.value,
      ageSeconds: Math.floor(ageMs / 1000),
      remainingTtlSeconds: Math.max(0, Math.ceil(remainingMs / 1000)),
      shouldRecomputeEarly: remainingMs <= 0 || shouldRecomputeEarly,
      headers: {
        'X-Cache': remainingMs > 0 ? 'HIT' : 'STALE',
        'Age': String(Math.floor(ageMs / 1000))
      }
    };
  }
}
