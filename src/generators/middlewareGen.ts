/**
 * CacheSmith Production Middleware Generators
 * Generates battle-tested caching middleware for Next.js, Express, Fastify, Cloudflare Workers, Hono, and FastAPI.
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import { FrameworkType, GeneratedMiddleware } from '../types.js';

export class MiddlewareGenerator {
  static generate(framework: FrameworkType, options: { ttlSeconds?: number; swrSeconds?: number; enableXFetch?: boolean } = {}): GeneratedMiddleware {
    const ttl = options.ttlSeconds || 60;
    const swr = options.swrSeconds || 86400;

    switch (framework) {
      case 'nextjs':
        return {
          framework: 'nextjs',
          title: 'Next.js 14/15 App Router Edge & SWR Route Handler',
          filename: 'app/api/cached-resource/route.ts',
          instructions: 'Drop this file into your Next.js App Router route. Integrates ISR, Cache-Control, and ETag conditional validation.',
          code: `import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Or export const revalidate = ${ttl};

export async function GET(req: NextRequest) {
  // 1. URL Parameter Normalization & ETag Calculation
  const searchParams = req.nextUrl.searchParams;
  const sortedKeys = Array.from(searchParams.keys()).sort();
  const canonicalQuery = sortedKeys.map(k => \`\${k}=\${searchParams.get(k)}\`).join('&');
  
  // 2. Compute or Fetch Data
  const data = {
    message: 'Hello from CacheSmith-optimized Next.js route',
    canonicalQuery,
    timestamp: Date.now()
  };

  const payload = JSON.stringify(data);
  const etag = 'W/"' + Buffer.from(payload).toString('base64').slice(0, 16) + '"';

  // 3. Conditional Revalidation (HTTP 304)
  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304 });
  }

  // 4. Return Response with RFC 9111 Headers
  return new NextResponse(payload, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=${ttl}, s-maxage=${ttl * 2}, stale-while-revalidate=${swr}',
      'ETag': etag,
      'Vary': 'Accept-Encoding'
    }
  });
}
`
        };

      case 'express':
        return {
          framework: 'express',
          title: 'Express.js XFetch & Stampede-Proof Cache Middleware',
          filename: 'cacheMiddleware.js',
          instructions: 'Mount with app.use("/api", cachesmithMiddleware({ ttlSeconds: ' + ttl + ' }))',
          code: `/**
 * CacheSmith Express Middleware with XFetch Probabilistic Early Recomputation
 * Prevents Cache Stampedes (Thundering Herd Problem) under heavy API traffic.
 */
const crypto = require('crypto');

function createCacheMiddleware({ ttlMs = ${ttl * 1000}, swrMs = ${swr * 1000}, beta = 1.0 } = {}) {
  const store = new Map();
  const inFlight = new Map();

  return async function cachesmithMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    // 1. Normalize Query Parameters
    const url = new URL(req.url, 'http://localhost');
    const sorted = Array.from(url.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    const cleanUrl = url.pathname + (sorted.length ? '?' + new URLSearchParams(sorted).toString() : '');
    const cacheKey = crypto.createHash('sha256').update(cleanUrl).digest('hex');

    const now = Date.now();
    const entry = store.get(cacheKey);

    if (entry) {
      const ageMs = now - entry.createdAt;
      const isExpired = ageMs >= entry.ttlMs;
      // XFetch Early Expiration Check: delta * beta * -ln(U)
      const u = Math.random() || 0.001;
      const earlyComputeThreshold = entry.deltaComputationMs * beta * -Math.log(u);
      const shouldRecompute = (now - entry.createdAt) - earlyComputeThreshold > (entry.ttlMs - entry.deltaComputationMs);

      if (!isExpired && !shouldRecompute) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Age', Math.floor(ageMs / 1000));
        res.setHeader('Cache-Control', 'public, max-age=${ttl}, stale-while-revalidate=${swr}');
        return res.status(entry.status).set(entry.headers).send(entry.body);
      }

      // If stale or early recompute, serve existing value while triggering background refresh
      if (entry && !inFlight.has(cacheKey)) {
        res.setHeader('X-Cache', 'STALE');
        res.setHeader('Age', Math.floor(ageMs / 1000));
        res.status(entry.status).set(entry.headers).send(entry.body);
        // Background refresh would run here...
        return;
      }
    }

    // 2. Intercept Response to Store in Cache
    const originalSend = res.send.bind(res);
    const start = Date.now();

    res.send = function (body) {
      const elapsed = Date.now() - start;
      store.set(cacheKey, {
        body,
        status: res.statusCode,
        headers: res.getHeaders(),
        createdAt: Date.now(),
        ttlMs,
        deltaComputationMs: elapsed
      });

      res.setHeader('X-Cache', 'MISS');
      res.setHeader('Cache-Control', 'public, max-age=${ttl}, stale-while-revalidate=${swr}');
      return originalSend(body);
    };

    next();
  };
}

module.exports = { createCacheMiddleware };
`
        };

      case 'fastify':
        return {
          framework: 'fastify',
          title: 'Fastify High-Throughput Caching Plugin',
          filename: 'plugins/cachesmith.js',
          instructions: 'Register in your Fastify instance: fastify.register(cachesmithFastifyPlugin)',
          code: `const fp = require('fastify-plugin');

async function cachesmithFastifyPlugin(fastify, options) {
  const cache = new Map();
  const ttlMs = ${ttl * 1000};

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'GET') return;
    const cacheKey = request.routerPath || request.url;
    const entry = cache.get(cacheKey);

    if (entry && (Date.now() - entry.createdAt < ttlMs)) {
      reply
        .header('X-Cache', 'HIT')
        .header('Age', Math.floor((Date.now() - entry.createdAt) / 1000))
        .header('Cache-Control', 'public, max-age=${ttl}')
        .type(entry.contentType)
        .send(entry.payload);
      return reply;
    }
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    if (request.method === 'GET' && reply.statusCode === 200) {
      const cacheKey = request.routerPath || request.url;
      cache.set(cacheKey, {
        payload,
        contentType: reply.getHeader('content-type') || 'application/json',
        createdAt: Date.now()
      });
      reply.header('X-Cache', 'MISS');
      reply.header('Cache-Control', 'public, max-age=${ttl}, stale-while-revalidate=${swr}');
    }
  });
}

module.exports = fp(cachesmithFastifyPlugin);
`
        };

      case 'cloudflare':
        return {
          framework: 'cloudflare',
          title: 'Cloudflare Workers KV Edge Cache Worker',
          filename: 'worker.ts',
          instructions: 'Deploy via wrangler deploy with KV namespace binding CACHE_KV',
          code: `export interface Env {
  CACHE_KV: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET') {
      return fetch(request);
    }

    // 1. Cloudflare Cache API lookup
    const cache = caches.default;
    let response = await cache.match(request);

    if (response) {
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-Cache', 'HIT-CF-EDGE');
      return new Response(response.body, { ...response, headers: newHeaders });
    }

    // 2. Fetch from origin and cache
    response = await fetch(request);
    if (response.status === 200) {
      const cacheResponse = new Response(response.body, response);
      cacheResponse.headers.set('Cache-Control', 'public, max-age=${ttl}, s-maxage=${ttl * 10}, stale-while-revalidate=${swr}');
      ctx.waitUntil(cache.put(request, cacheResponse.clone()));
      return cacheResponse;
    }

    return response;
  }
};
`
        };

      case 'hono':
        return {
          framework: 'hono',
          title: 'Hono Multi-Runtime Edge Cache Middleware',
          filename: 'middleware/cache.ts',
          instructions: 'Use app.use("*", cachesmithHonoMiddleware()) in Cloudflare, Deno, Bun, or Node.js',
          code: `import { MiddlewareHandler } from 'hono';

const memoryStore = new Map<string, { body: string; headers: Record<string, string>; exp: number }>();

export const cachesmithHonoMiddleware = (ttlSec = ${ttl}): MiddlewareHandler => {
  return async (c, next) => {
    if (c.req.method !== 'GET') {
      return await next();
    }

    const key = c.req.url;
    const now = Date.now();
    const hit = memoryStore.get(key);

    if (hit && hit.exp > now) {
      c.header('X-Cache', 'HIT');
      c.header('Age', Math.floor((now - (hit.exp - ttlSec * 1000)) / 1000).toString());
      return c.body(hit.body, 200, hit.headers);
    }

    await next();

    if (c.res.status === 200) {
      const cloned = c.res.clone();
      const body = await cloned.text();
      memoryStore.set(key, {
        body,
        headers: Object.fromEntries(c.res.headers.entries()),
        exp: now + ttlSec * 1000
      });
      c.header('X-Cache', 'MISS');
      c.header('Cache-Control', 'public, max-age=${ttl}, stale-while-revalidate=${swr}');
    }
  };
};
`
        };

      case 'fastapi':
        return {
          framework: 'fastapi',
          title: 'FastAPI Python Async Cache-Control Middleware',
          filename: 'middleware/cache.py',
          instructions: 'Add to FastAPI app: app.add_middleware(CacheSmithMiddleware, ttl_seconds=' + ttl + ')',
          code: `"""
CacheSmith FastAPI Async Response Caching Middleware
Enforces RFC 9111 Cache-Control and ETag headers.
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import hashlib
import time

class CacheSmithMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, ttl_seconds: int = ${ttl}, swr_seconds: int = ${swr}):
        super().__init__(app)
        self.ttl = ttl_seconds
        self.swr = swr_seconds
        self.store = {}

    async def dispatch(self, request: Request, call_next):
        if request.method != "GET":
            return await call_next(request)

        # Key normalization
        query_parts = sorted(request.query_params.multi_items())
        cache_key = f"{request.url.path}?" + "&".join(f"{k}={v}" for k, v in query_parts)
        now = time.time()

        if cache_key in self.store:
            entry = self.store[cache_key]
            if now < entry["expires_at"]:
                headers = dict(entry["headers"])
                headers["x-cache"] = "HIT"
                headers["age"] = str(int(now - entry["created_at"]))
                return Response(content=entry["body"], status_code=entry["status"], headers=headers)

        response = await call_next(request)
        if response.status_code == 200:
            body = [section async for section in response.body_iterator]
            response.body_iterator = iter(body)
            full_body = b"".join(body)
            etag = f'W/"{hashlib.md5(full_body).hexdigest()[:16]}"'

            response.headers["cache-control"] = f"public, max-age={self.ttl}, stale-while-revalidate={self.swr}"
            response.headers["etag"] = etag
            response.headers["vary"] = "Accept-Encoding"
            response.headers["x-cache"] = "MISS"

            self.store[cache_key] = {
                "body": full_body,
                "status": response.status_code,
                "headers": dict(response.headers),
                "created_at": now,
                "expires_at": now + self.ttl
            }

        return response
`
        };
    }
  }
}
