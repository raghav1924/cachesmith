/**
 * CacheSmith Core Engine & Stampede Simulator
 * Implements Naive Caching, Mutex Singleflight, and Optimal Probabilistic
 * Early Expiration (XFetch Algorithm - Vattani et al., VLDB).
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import { CacheEntry, CacheLookupResult, CacheStrategy, StampedeSimulationResult } from '../types.js';

export class CacheEngine {
  private store = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<any>>();

  /**
   * Put an entry into the cache
   */
  set<T>(key: string, value: T, ttlMs: number, deltaComputationMs = 50, swrMs = 0, beta = 1.0, createdAt = Date.now()): CacheEntry<T> {
    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt,
      ttlMs,
      deltaComputationMs,
      swrMs,
      beta
    };
    this.store.set(key, entry);
    return entry;
  }

  /**
   * Get an entry using the selected caching strategy
   */
  get<T>(key: string, strategy: CacheStrategy = 'xfetch-probabilistic', now = Date.now()): CacheLookupResult<T> {
    const entry = this.store.get(key);
    if (!entry) {
      return {
        status: 'MISS',
        value: null,
        ageSeconds: 0,
        remainingTtlSeconds: 0,
        shouldRecomputeEarly: true,
        headers: { 'X-Cache': 'MISS', 'Age': '0' }
      };
    }

    const ageMs = now - entry.createdAt;
    const ageSeconds = Math.max(0, Math.floor(ageMs / 1000));
    const remainingMs = entry.ttlMs - ageMs;
    const remainingTtlSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

    if (strategy === 'naive') {
      if (remainingMs > 0) {
        return {
          status: 'HIT',
          value: entry.value,
          ageSeconds,
          remainingTtlSeconds,
          shouldRecomputeEarly: false,
          headers: { 'X-Cache': 'HIT', 'Age': String(ageSeconds) }
        };
      }
      return {
        status: 'MISS',
        value: null,
        ageSeconds,
        remainingTtlSeconds: 0,
        shouldRecomputeEarly: true,
        headers: { 'X-Cache': 'MISS', 'Age': String(ageSeconds) }
      };
    }

    if (strategy === 'mutex-singleflight') {
      if (remainingMs > 0) {
        return {
          status: 'HIT',
          value: entry.value,
          ageSeconds,
          remainingTtlSeconds,
          shouldRecomputeEarly: false,
          headers: { 'X-Cache': 'HIT', 'Age': String(ageSeconds) }
        };
      }
      // Stale while mutex revalidates
      const withinSwr = entry.swrMs ? ageMs <= entry.ttlMs + entry.swrMs : false;
      return {
        status: withinSwr ? 'STALE' : 'MISS',
        value: withinSwr ? entry.value : null,
        ageSeconds,
        remainingTtlSeconds: 0,
        shouldRecomputeEarly: true,
        headers: { 'X-Cache': withinSwr ? 'STALE' : 'MISS', 'Age': String(ageSeconds) }
      };
    }

    // 3. XFetch: Optimal Probabilistic Early Expiration Algorithm
    // Condition: now - beta * delta * ln(random(0,1]) > expiry
    const beta = entry.beta || 1.0;
    const deltaMs = entry.deltaComputationMs || 50;
    const u = Math.max(0.0001, Math.random());
    const xfetchThreshold = now - (beta * deltaMs * Math.log(u));
    const expiryTimestamp = entry.createdAt + entry.ttlMs;

    const shouldRecomputeEarly = xfetchThreshold > expiryTimestamp;

    if (remainingMs > 0) {
      return {
        status: shouldRecomputeEarly ? 'REVALIDATED' : 'HIT',
        value: entry.value,
        ageSeconds,
        remainingTtlSeconds,
        shouldRecomputeEarly,
        headers: {
          'X-Cache': shouldRecomputeEarly ? 'REVALIDATING-EARLY' : 'HIT',
          'Age': String(ageSeconds),
          'X-XFetch-Triggered': shouldRecomputeEarly ? 'true' : 'false'
        }
      };
    }

    // If already expired but within SWR window
    const withinSwr = entry.swrMs ? ageMs <= entry.ttlMs + entry.swrMs : false;
    return {
      status: withinSwr ? 'STALE' : 'MISS',
      value: withinSwr ? entry.value : null,
      ageSeconds,
      remainingTtlSeconds: 0,
      shouldRecomputeEarly: true,
      headers: { 'X-Cache': withinSwr ? 'STALE' : 'MISS', 'Age': String(ageSeconds) }
    };
  }

  clear(): void {
    this.store.clear();
    this.inFlight.clear();
  }
}

export class StampedeSimulator {
  static async run(strategy: CacheStrategy, workerCount = 100): Promise<StampedeSimulationResult> {
    return Promise.resolve(this.simulate(strategy, workerCount));
  }

  /**
   * Simulate a cache stampede / thundering herd where 100 concurrent workers
   * query a key around its expiration point across different strategies.
   */
  static simulate(
    strategy: CacheStrategy,
    workerCount = 100,
    dbLatencyMs = 60,
    ttlMs = 1000
  ): StampedeSimulationResult {
    const timelineBuckets: { second: number; dbLoad: number; cacheHits: number }[] = [];
    for (let s = 0; s < 5; s++) {
      timelineBuckets.push({ second: s, dbLoad: 0, cacheHits: 0 });
    }

    const engine = new CacheEngine();
    // Key has reached expiration
    const initialCreated = Date.now() - 1000;
    engine.set('sample_catalog', { data: 'catalog_payload' }, ttlMs, dbLatencyMs, 500, 1.0, initialCreated);

    let totalDbQueries = 0;
    let maxConcurrentDbQueries = 0;
    const latencies: number[] = [];

    if (strategy === 'naive') {
      // In Naive cache, key is expired at t=1000ms+, so all workers experience cache miss & hit DB!
      for (let w = 0; w < workerCount; w++) {
        const queryTime = initialCreated + 1010 + (w * 2);
        const result = engine.get('sample_catalog', 'naive', queryTime);

        if (result.status === 'MISS') {
          totalDbQueries++;
          latencies.push(dbLatencyMs + Math.floor(Math.random() * 15));
          const sec = Math.min(4, Math.floor((queryTime - initialCreated) / 1000));
          timelineBuckets[sec].dbLoad++;
        } else {
          latencies.push(1 + Math.floor(Math.random() * 2));
          const sec = Math.min(4, Math.floor((queryTime - initialCreated) / 1000));
          timelineBuckets[sec].cacheHits++;
        }
      }
      maxConcurrentDbQueries = totalDbQueries;
    } else if (strategy === 'mutex-singleflight') {
      // Mutex locks: exactly 1 worker executes DB query, others queue or wait
      let hasInFlight = false;
      for (let w = 0; w < workerCount; w++) {
        const queryTime = initialCreated + 1010 + (w * 2);
        const result = engine.get('sample_catalog', 'mutex-singleflight', queryTime);

        if (result.status === 'MISS' || result.status === 'STALE') {
          if (!hasInFlight) {
            hasInFlight = true;
            totalDbQueries++;
            latencies.push(dbLatencyMs);
            const sec = Math.min(4, Math.floor((queryTime - initialCreated) / 1000));
            timelineBuckets[sec].dbLoad++;
          } else {
            // Waiting on mutex lock
            latencies.push(Math.max(5, dbLatencyMs - (w * 2)));
            const sec = Math.min(4, Math.floor((queryTime - initialCreated) / 1000));
            timelineBuckets[sec].cacheHits++;
          }
        } else {
          latencies.push(1);
          const sec = Math.min(4, Math.floor((queryTime - initialCreated) / 1000));
          timelineBuckets[sec].cacheHits++;
        }
      }
      maxConcurrentDbQueries = 1;
    } else {
      // 3. XFetch Probabilistic Early Expiration:
      // Evaluates near expiry (age = 960ms of 1000ms TTL)
      let refreshed = false;
      for (let w = 0; w < workerCount; w++) {
        const queryTime = initialCreated + 960 + (w * 2);
        const result = engine.get('sample_catalog', 'xfetch-probabilistic', queryTime);

        if ((result.shouldRecomputeEarly || result.status === 'REVALIDATED' || result.status === 'MISS') && !refreshed) {
          refreshed = true;
          totalDbQueries++;
          // Recomputation happens asynchronously in background; client still gets cached value!
          latencies.push(2); // Client does NOT wait for DB!
          const sec = Math.min(4, Math.floor((queryTime - initialCreated) / 1000));
          timelineBuckets[sec].dbLoad++;
          timelineBuckets[sec].cacheHits++;
        } else {
          latencies.push(1);
          const sec = Math.min(4, Math.floor((queryTime - initialCreated) / 1000));
          timelineBuckets[sec].cacheHits++;
        }
      }
      maxConcurrentDbQueries = 1;
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const avgLatencyMs = Math.round(latencies.reduce((sum, l) => sum + l, 0) / (latencies.length || 1));
    const p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const stampedeSpikePercent = Math.round((totalDbQueries / workerCount) * 100);

    const descriptions: Record<CacheStrategy, { name: string; desc: string }> = {
      'naive': {
        name: 'Naive Cache Expiration',
        desc: 'All 100 concurrent workers experience a cache miss simultaneously when the key expires, hammering the database with 100 concurrent queries.'
      },
      'mutex-singleflight': {
        name: 'Distributed Mutex / Singleflight Lock',
        desc: 'The first worker acquires a lock to recompute the value while remaining workers wait on the lock or receive stale data.'
      },
      'xfetch-probabilistic': {
        name: 'Optimal Probabilistic Early Expiration (XFetch)',
        desc: 'Proactively triggers background recomputation before TTL expires based on computation delta time. Zero cache misses and zero user-facing latency!'
      }
    };

    return {
      strategy,
      name: descriptions[strategy].name,
      description: descriptions[strategy].desc,
      workerCount,
      totalDbQueries,
      stampedeSpikePercent,
      maxConcurrentDbQueries,
      avgLatencyMs,
      p95LatencyMs,
      timelineBuckets
    };
  }

  /**
   * Run all 3 strategies side-by-side for comparative benchmark
   */
  static compareAll(workerCount = 100, dbLatencyMs = 60): Record<CacheStrategy, StampedeSimulationResult> {
    return {
      'naive': this.simulate('naive', workerCount, dbLatencyMs),
      'mutex-singleflight': this.simulate('mutex-singleflight', workerCount, dbLatencyMs),
      'xfetch-probabilistic': this.simulate('xfetch-probabilistic', workerCount, dbLatencyMs)
    };
  }
}
