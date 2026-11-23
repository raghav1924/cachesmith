/**
 * CacheSmith Core Type Definitions
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

export type CacheStrategy = 'naive' | 'mutex-singleflight' | 'xfetch-probabilistic';

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  createdAt: number; // epoch ms
  ttlMs: number; // TTL in milliseconds
  deltaComputationMs: number; // delta: time it took to compute the value
  swrMs?: number; // stale-while-revalidate window
  beta?: number; // beta parameter for XFetch (default 1.0)
}

export type CacheStatus = 'HIT' | 'MISS' | 'STALE' | 'REVALIDATED';

export interface CacheLookupResult<T = any> {
  status: CacheStatus;
  value: T | null;
  ageSeconds: number;
  remainingTtlSeconds: number;
  shouldRecomputeEarly: boolean;
  headers: Record<string, string>;
}

export interface StampedeSimulationResult {
  strategy: CacheStrategy;
  name: string;
  description: string;
  workerCount: number;
  totalDbQueries: number;
  stampedeSpikePercent: number; // percentage of workers that hit the DB simultaneously
  maxConcurrentDbQueries: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  timelineBuckets: { second: number; dbLoad: number; cacheHits: number }[];
}

export type IssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type CacheSection = 'DIRECTIVES' | 'VARY' | 'FRESHNESS' | 'SECURITY' | 'KEYS';

export interface AuditIssue {
  code: string;
  severity: IssueSeverity;
  section: CacheSection;
  message: string;
  recommendation: string;
  headerKey?: string;
  receivedValue?: string;
}

export interface ParsedCacheControl {
  isPublic?: boolean;
  isPrivate?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  noTransform?: boolean;
  mustRevalidate?: boolean;
  proxyRevalidate?: boolean;
  immutable?: boolean;
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  raw: string;
}

export interface CacheAuditResult {
  url: string;
  statusCode: number;
  score: number; // 0 - 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'F';
  parsedDirectives: ParsedCacheControl;
  issues: AuditIssue[];
  headers: Record<string, string>;
  isCdnOptimal: boolean;
  summary: {
    browserTtlSec?: number;
    cdnTtlSec?: number;
    swrWindowSec?: number;
    hasVaryAuth: boolean;
    hasVaryEncoding: boolean;
    hasETagOrLastModified: boolean;
  };
}

export interface NormalizedKeyResult {
  originalUrl: string;
  normalizedUrl: string;
  cacheKeySha256: string;
  strippedTrackingParams: string[];
  sortedParamsCount: number;
  cardinalityRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
}

export type FrameworkType = 'nextjs' | 'express' | 'fastify' | 'cloudflare' | 'hono' | 'fastapi';

export interface GeneratedMiddleware {
  framework: FrameworkType;
  title: string;
  filename: string;
  code: string;
  instructions: string;
}
