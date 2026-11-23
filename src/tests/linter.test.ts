/**
 * CacheSmith RFC 9111 Linter Tests
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import test from 'node:test';
import assert from 'node:assert';
import { CacheLinter } from '../core/linter.js';

test('CacheLinter: correctly parses multi-directive Cache-Control', () => {
  const parsed = CacheLinter.parseCacheControl('public, max-age=3600, s-maxage=7200, stale-while-revalidate=86400, immutable');
  assert.strictEqual(parsed.isPublic, true);
  assert.strictEqual(parsed.maxAge, 3600);
  assert.strictEqual(parsed.sMaxAge, 7200);
  assert.strictEqual(parsed.staleWhileRevalidate, 86400);
  assert.strictEqual(parsed.immutable, true);
});

test('CacheLinter: detects missing Cache-Control (CACHE-001)', () => {
  const result = CacheLinter.auditHeaders({});
  assert.ok(result.issues.some((i) => i.code === 'CACHE-001'));
  assert.strictEqual(result.grade, 'B');
});

test('CacheLinter: catches critical conflict between no-store and max-age (CACHE-002)', () => {
  const result = CacheLinter.auditHeaders({
    'Cache-Control': 'no-store, max-age=3600'
  });
  const issue = result.issues.find((i) => i.code === 'CACHE-002');
  assert.ok(issue);
  assert.strictEqual(issue?.severity, 'CRITICAL');
});

test('CacheLinter: catches critical security leak of Set-Cookie on public cache (CACHE-004)', () => {
  const result = CacheLinter.auditHeaders({
    'Cache-Control': 'public, max-age=3600',
    'Set-Cookie': 'session_id=secret_jwt_token'
  });
  const issue = result.issues.find((i) => i.code === 'CACHE-004');
  assert.ok(issue);
  assert.strictEqual(issue?.severity, 'CRITICAL');
});

test('CacheLinter: awards A+ grade to perfectly optimized edge headers', () => {
  const result = CacheLinter.auditHeaders({
    'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
    'Vary': 'Accept-Encoding',
    'ETag': '"hash123"',
    'CDN-Cache-Control': 'max-age=604800',
    'Content-Type': 'application/json'
  });
  assert.strictEqual(result.grade, 'A+');
  assert.ok(result.score >= 95);
  assert.strictEqual(result.isCdnOptimal, true);
});
