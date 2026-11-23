/**
 * CacheSmith Reverse Proxy Integration Tests
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import test from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { CacheProxy } from '../proxy/cacheProxy.js';

function requestPromise(url: string): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 200,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

test('CacheProxy: caches requests, serves HIT on subsequent access, and records stats', async () => {
  const testPort = 8996;
  const proxy = new CacheProxy({ port: testPort, defaultTtlMs: 5000 });
  await proxy.start();

  try {
    const testUrl = `http://localhost:${testPort}/api/v1/resource?id=500`;

    // 1st request -> MISS
    const res1 = await requestPromise(testUrl);
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res1.headers['x-cache'], 'MISS');

    // 2nd request -> HIT
    const res2 = await requestPromise(testUrl);
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.headers['x-cache'], 'HIT');

    // 3rd request -> Query param re-ordered (?id=500&sort=asc vs ?sort=asc&id=500)
    const res3a = await requestPromise(`http://localhost:${testPort}/search?a=1&b=2`);
    assert.strictEqual(res3a.headers['x-cache'], 'MISS');

    const res3b = await requestPromise(`http://localhost:${testPort}/search?b=2&a=1`);
    assert.strictEqual(res3b.headers['x-cache'], 'HIT');

    // Check stats endpoint
    const statsRes = await requestPromise(`http://localhost:${testPort}/__cachesmith/stats`);
    const stats = JSON.parse(statsRes.body);
    assert.strictEqual(stats.requests, 4);
    assert.strictEqual(stats.hits, 2);
    assert.strictEqual(stats.misses, 2);
    assert.strictEqual(stats.hitRatioPercent, 50);
  } finally {
    await proxy.stop();
  }
});
