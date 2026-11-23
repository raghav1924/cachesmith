/**
 * CacheSmith Middleware Generator Tests
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import test from 'node:test';
import assert from 'node:assert';
import { MiddlewareGenerator } from '../generators/middlewareGen.js';
import { FrameworkType } from '../types.js';

test('MiddlewareGenerator: generates valid code for all 6 frameworks', () => {
  const frameworks: FrameworkType[] = ['nextjs', 'express', 'fastify', 'cloudflare', 'hono', 'fastapi'];

  for (const fw of frameworks) {
    const res = MiddlewareGenerator.generate(fw, { ttlSeconds: 120, swrSeconds: 3600 });
    assert.strictEqual(res.framework, fw);
    assert.ok(res.code.length > 50, `Framework ${fw} generated empty code`);
    assert.ok(res.title.length > 0);
    assert.ok(res.filename.length > 0);
    assert.ok(res.code.includes('120') || res.code.includes('120000'), `TTL not reflected in ${fw}`);
  }
});
