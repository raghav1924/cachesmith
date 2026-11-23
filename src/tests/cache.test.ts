/**
 * CacheSmith Core Engine & Stampede Simulator Tests
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import test from 'node:test';
import assert from 'node:assert';
import { CacheEngine, StampedeSimulator } from '../core/cache.js';

test('CacheEngine: set and get returns HIT for fresh items', () => {
  const engine = new CacheEngine();
  engine.set('user:101', { name: 'Alice' }, 10000, 25);

  const res = engine.get('user:101');
  assert.strictEqual(res.status, 'HIT');
  assert.deepStrictEqual(res.value, { name: 'Alice' });
  assert.strictEqual(res.headers['X-Cache'], 'HIT');
});

test('CacheEngine: returns MISS for unknown keys', () => {
  const engine = new CacheEngine();
  const res = engine.get('user:999');
  assert.strictEqual(res.status, 'MISS');
  assert.strictEqual(res.value, null);
  assert.strictEqual(res.shouldRecomputeEarly, true);
});

test('CacheEngine: handles TTL expiration and SWR', () => {
  const engine = new CacheEngine();
  const entry = engine.set('user:202', { name: 'Bob' }, 100, 10, 500); // 100ms TTL, 500ms SWR

  // Simulate time after TTL (200ms) with SWR enabled
  const resAfterTtl = engine.get('user:202', 'mutex-singleflight', entry.createdAt + 200);
  assert.strictEqual(resAfterTtl.status, 'STALE');
  assert.strictEqual(resAfterTtl.shouldRecomputeEarly, true);
});

test('StampedeSimulator: compares Naive, Mutex, and XFetch under 50 concurrent workers', async () => {
  const naive = await StampedeSimulator.run('naive', 50);
  assert.strictEqual(naive.totalDbQueries, 50);
  assert.strictEqual(naive.stampedeSpikePercent, 100);

  const mutex = await StampedeSimulator.run('mutex-singleflight', 50);
  assert.strictEqual(mutex.totalDbQueries, 1);
  assert.strictEqual(mutex.maxConcurrentDbQueries, 1);

  const xfetch = await StampedeSimulator.run('xfetch-probabilistic', 50);
  assert.strictEqual(xfetch.totalDbQueries, 1);
  assert.ok(xfetch.p95LatencyMs < naive.p95LatencyMs);
});
