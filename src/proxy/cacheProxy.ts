/**
 * CacheSmith Zero-Config HTTP Caching Reverse Proxy
 * Sits between clients and backends, applying RFC 9111 TTL caching and XFetch stampede protection.
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import http from 'http';
import { CacheEngine } from '../core/cache.js';
import { CacheKeyNormalizer } from '../core/keyNormalizer.js';
import { CacheLinter } from '../core/linter.js';
import { CacheStrategy } from '../types.js';

export interface ProxyOptions {
  port?: number;
  targetUrl?: string; // Optional origin backend to proxy to
  strategy?: CacheStrategy;
  defaultTtlMs?: number;
  swrMs?: number;
  verbose?: boolean;
}

export interface ProxyStats {
  requests: number;
  hits: number;
  misses: number;
  stale: number;
  bytesSaved: number;
  hitRatioPercent: number;
}

export class CacheProxy {
  private server: http.Server | null = null;
  private cache = new CacheEngine();
  private stats: ProxyStats = {
    requests: 0,
    hits: 0,
    misses: 0,
    stale: 0,
    bytesSaved: 0,
    hitRatioPercent: 0
  };

  constructor(private options: ProxyOptions = {}) {
    this.options.port = options.port || 8086;
    this.options.strategy = options.strategy || 'xfetch-probabilistic';
    this.options.defaultTtlMs = options.defaultTtlMs || 30000;
    this.options.swrMs = options.swrMs || 60000;
  }

  getStats(): ProxyStats {
    const total = this.stats.requests;
    this.stats.hitRatioPercent = total > 0 ? Math.round(((this.stats.hits + this.stats.stale) / total) * 100) : 0;
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      requests: 0,
      hits: 0,
      misses: 0,
      stale: 0,
      bytesSaved: 0,
      hitRatioPercent: 0
    };
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        // Internal stats endpoint
        if (req.url === '/__cachesmith/stats') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.getStats(), null, 2));
          return;
        }

        this.stats.requests++;
        const startTime = Date.now();

        // Only cache GET and HEAD requests
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'CacheProxy only caches GET/HEAD methods in accordance with RFC 9111' }));
          return;
        }

        const norm = CacheKeyNormalizer.normalize(req.url || '/');
        const cacheKey = `${req.method}:${norm.normalizedUrl}`;

        // Check cache
        const lookup = this.cache.get<{ status: number; headers: Record<string, string>; body: string }>(
          cacheKey,
          this.options.strategy
        );

        if (lookup.status === 'HIT' && lookup.value) {
          this.stats.hits++;
          this.stats.bytesSaved += Buffer.byteLength(lookup.value.body);
          res.writeHead(lookup.value.status, {
            ...lookup.value.headers,
            'X-Cache': 'HIT',
            'Age': String(lookup.ageSeconds),
            'X-CacheSmith-Strategy': this.options.strategy!
          });
          res.end(lookup.value.body);
          return;
        }

        if (lookup.status === 'STALE' && lookup.value) {
          this.stats.stale++;
          this.stats.bytesSaved += Buffer.byteLength(lookup.value.body);
          // Return stale payload immediately while asynchronously recomputing
          res.writeHead(lookup.value.status, {
            ...lookup.value.headers,
            'X-Cache': 'STALE',
            'Age': String(lookup.ageSeconds),
            'X-CacheSmith-Strategy': this.options.strategy!
          });
          res.end(lookup.value.body);

          // Asynchronous background refresh
          this.fetchOriginAndCache(cacheKey, req.url || '/');
          return;
        }

        // Cache MISS - Fetch fresh from origin or mock backend
        this.stats.misses++;
        try {
          const fresh = await this.fetchOrigin(req.url || '/');
          const elapsed = Date.now() - startTime;

          // Determine TTL from response headers or defaults
          const ccHeader = (fresh.headers['cache-control'] || fresh.headers['Cache-Control']) as string | undefined;
          const parsed = CacheLinter.parseCacheControl(ccHeader || '');
          const ttlMs = (parsed.maxAge !== undefined ? parsed.maxAge * 1000 : this.options.defaultTtlMs) || 30000;
          const swrMs = (parsed.staleWhileRevalidate !== undefined ? parsed.staleWhileRevalidate * 1000 : this.options.swrMs) || 60000;

          if (!parsed.noStore) {
            this.cache.set(cacheKey, fresh, ttlMs, elapsed, swrMs);
          }

          res.writeHead(fresh.status, {
            ...fresh.headers,
            'X-Cache': 'MISS',
            'Age': '0',
            'X-CacheSmith-Strategy': this.options.strategy!
          });
          res.end(fresh.body);
        } catch (err: any) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'CacheProxy upstream failure', message: err.message }));
        }
      });

      this.server.listen(this.options.port || 8086, () => {
        resolve(this.options.port || 8086);
      });

      this.server.on('error', (err) => reject(err));
    });
  }

  private async fetchOriginAndCache(cacheKey: string, url: string): Promise<void> {
    try {
      const start = Date.now();
      const fresh = await this.fetchOrigin(url);
      const elapsed = Date.now() - start;
      const cc = CacheLinter.parseCacheControl(fresh.headers['cache-control']);
      const ttl = cc.maxAge ? cc.maxAge * 1000 : this.options.defaultTtlMs!;
      const swr = cc.staleWhileRevalidate ? cc.staleWhileRevalidate * 1000 : this.options.swrMs!;
      this.cache.set(cacheKey, fresh, ttl, elapsed, swr);
    } catch {
      // background error silently handled
    }
  }

  private async fetchOrigin(url: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    // If targetUrl is defined, proxy to remote target
    if (this.options.targetUrl) {
      return new Promise((resolve, reject) => {
        const fullTarget = new URL(url, this.options.targetUrl);
        http.get(fullTarget.toString(), (resp) => {
          let data = '';
          resp.on('data', (chunk) => (data += chunk));
          resp.on('end', () => {
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(resp.headers)) {
              if (v) headers[k] = Array.isArray(v) ? v.join(', ') : v;
            }
            resolve({
              status: resp.statusCode || 200,
              headers,
              body: data
            });
          });
        }).on('error', reject);
      });
    }

    // Default built-in origin simulator
    await new Promise((r) => setTimeout(r, 60)); // Simulate 60ms backend DB query
    return {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=10, stale-while-revalidate=30',
        'etag': '"hash-' + Math.random().toString(36).slice(2, 8) + '"',
        'vary': 'Accept-Encoding'
      },
      body: JSON.stringify({
        status: 'OK',
        timestamp: new Date().toISOString(),
        resource: url,
        computedInMs: 60,
        provider: 'CacheSmith Mock Origin Engine',
        author: 'Jatin Sharma (https://jatinsh.netlify.app/)'
      })
    };
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
