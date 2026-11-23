/**
 * CacheSmith Key Normalizer & Cardinality Tests
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import test from 'node:test';
import assert from 'node:assert';
import { CacheKeyNormalizer } from '../core/keyNormalizer.js';

test('CacheKeyNormalizer: sorts query params alphabetically', () => {
  const norm1 = CacheKeyNormalizer.normalize('https://api.example.com/items?b=2&a=1&c=3');
  const norm2 = CacheKeyNormalizer.normalize('https://api.example.com/items?c=3&a=1&b=2');

  assert.strictEqual(norm1.normalizedUrl, norm2.normalizedUrl);
  assert.strictEqual(norm1.cacheKeySha256, norm2.cacheKeySha256);
  assert.ok(norm1.normalizedUrl.endsWith('?a=1&b=2&c=3'));
});

test('CacheKeyNormalizer: strips marketing and analytics tracking parameters', () => {
  const result = CacheKeyNormalizer.normalize(
    'https://api.example.com/products?utm_source=google&id=42&fbclid=abcdef&gclid=12345'
  );

  assert.deepStrictEqual(result.strippedTrackingParams.sort(), ['fbclid', 'gclid', 'utm_source'].sort());
  assert.ok(!result.normalizedUrl.includes('utm_source'));
  assert.ok(!result.normalizedUrl.includes('fbclid'));
  assert.ok(result.normalizedUrl.includes('id=42'));
});

test('CacheKeyNormalizer: identifies HIGH cardinality risks for timestamps and UUIDs', () => {
  const resTimestamp = CacheKeyNormalizer.normalize('https://api.example.com/data?timestamp=1732338000000');
  assert.strictEqual(resTimestamp.cardinalityRisk, 'HIGH');

  const resUuid = CacheKeyNormalizer.normalize('https://api.example.com/data?nonce=a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d');
  assert.strictEqual(resUuid.cardinalityRisk, 'HIGH');

  const resClean = CacheKeyNormalizer.normalize('https://api.example.com/data?category=books&limit=20');
  assert.strictEqual(resClean.cardinalityRisk, 'LOW');
});
