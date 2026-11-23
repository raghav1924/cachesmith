/**
 * CacheSmith RFC 9111 & RFC 5861 Cache Linter & Heuristics Engine
 * Checks HTTP headers against 16+ production edge and browser caching rules.
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import { AuditIssue, CacheAuditResult, ParsedCacheControl } from '../types.js';

export class CacheLinter {
  /**
   * Parse a Cache-Control header string into structured directives
   */
  static parseCacheControl(headerValue = ''): ParsedCacheControl {
    const raw = headerValue.trim();
    const parsed: ParsedCacheControl = { raw };

    if (!raw) return parsed;

    const parts = raw.split(',').map((p) => p.trim());
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower === 'public') parsed.isPublic = true;
      else if (lower === 'private') parsed.isPrivate = true;
      else if (lower === 'no-cache') parsed.noCache = true;
      else if (lower === 'no-store') parsed.noStore = true;
      else if (lower === 'no-transform') parsed.noTransform = true;
      else if (lower === 'must-revalidate') parsed.mustRevalidate = true;
      else if (lower === 'proxy-revalidate') parsed.proxyRevalidate = true;
      else if (lower === 'immutable') parsed.immutable = true;
      else if (lower.startsWith('max-age=')) {
        const val = parseInt(lower.split('=')[1], 10);
        if (!isNaN(val)) parsed.maxAge = val;
      } else if (lower.startsWith('s-maxage=')) {
        const val = parseInt(lower.split('=')[1], 10);
        if (!isNaN(val)) parsed.sMaxAge = val;
      } else if (lower.startsWith('stale-while-revalidate=')) {
        const val = parseInt(lower.split('=')[1], 10);
        if (!isNaN(val)) parsed.staleWhileRevalidate = val;
      } else if (lower.startsWith('stale-if-error=')) {
        const val = parseInt(lower.split('=')[1], 10);
        if (!isNaN(val)) parsed.staleIfError = val;
      }
    }

    return parsed;
  }

  /**
   * Audit an HTTP response's headers against 16 RFC 9111 & RFC 5861 heuristics
   */
  static auditHeaders(
    headers: Record<string, string | string[] | undefined>,
    statusCode = 200,
    url = 'https://api.example.com/data'
  ): CacheAuditResult {
    // Normalize headers to lowercase
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
      }
    }

    const issues: AuditIssue[] = [];
    const ccHeader = normalized['cache-control'] || '';
    const parsedCc = this.parseCacheControl(ccHeader);

    const varyHeader = normalized['vary'] || '';
    const varyTokens = varyHeader.toLowerCase().split(',').map((s) => s.trim());
    const etagHeader = normalized['etag'];
    const lastModifiedHeader = normalized['last-modified'];
    const ageHeader = normalized['age'] ? parseInt(normalized['age'], 10) : undefined;
    const setCookieHeader = normalized['set-cookie'];
    const pragmaHeader = normalized['pragma'] || '';

    // RULE 1: Missing Cache-Control
    if (!ccHeader) {
      issues.push({
        code: 'CACHE-001',
        severity: 'HIGH',
        section: 'DIRECTIVES',
        message: 'Missing Cache-Control header. Upstream CDNs and browsers will apply unpredictable heuristic caching.',
        recommendation: 'Explicitly define "Cache-Control: public, max-age=60, s-maxage=3600, stale-while-revalidate=86400" or "Cache-Control: no-store, private".'
      });
    }

    // RULE 2: Conflicting no-store and max-age / s-maxage
    if (parsedCc.noStore && (parsedCc.maxAge !== undefined || parsedCc.sMaxAge !== undefined || parsedCc.isPublic)) {
      issues.push({
        code: 'CACHE-002',
        severity: 'CRITICAL',
        section: 'DIRECTIVES',
        message: 'Conflicting Cache-Control directives: "no-store" cannot be combined with "max-age", "s-maxage", or "public".',
        recommendation: 'Remove max-age and public directives if the resource must not be stored, or remove no-store if caching is intended.',
        headerKey: 'Cache-Control',
        receivedValue: ccHeader
      });
    }

    // RULE 3: Missing Vary: Accept-Encoding
    const contentType = (normalized['content-type'] || '').toLowerCase();
    const isCompressible =
      contentType.includes('json') ||
      contentType.includes('html') ||
      contentType.includes('javascript') ||
      contentType.includes('text') ||
      contentType.includes('xml');

    if (isCompressible && !varyTokens.includes('accept-encoding') && !varyTokens.includes('*')) {
      issues.push({
        code: 'CACHE-003',
        severity: 'MEDIUM',
        section: 'VARY',
        message: 'Compressible text payload without "Vary: Accept-Encoding". Risk of serving uncompressed payloads or gzip-compressed payloads to unsupported clients.',
        recommendation: 'Add "Vary: Accept-Encoding" header so CDNs cache separate variants for gzip, brotli, and identity encodings.',
        headerKey: 'Vary',
        receivedValue: varyHeader || '(missing)'
      });
    }

    // RULE 4: Public caching on authenticated response without Vary: Authorization
    if (parsedCc.isPublic && setCookieHeader) {
      issues.push({
        code: 'CACHE-004',
        severity: 'CRITICAL',
        section: 'SECURITY',
        message: 'Severe security risk: "Cache-Control: public" combined with "Set-Cookie" header. Shared CDNs may cache user session cookies and leak them to other users!',
        recommendation: 'Set "Cache-Control: private, no-cache" or strip Set-Cookie before allowing shared proxy caching.',
        headerKey: 'Set-Cookie'
      });
    }

    // RULE 5: max-age=0 without must-revalidate or no-cache
    if (parsedCc.maxAge === 0 && !parsedCc.mustRevalidate && !parsedCc.noCache && !parsedCc.noStore) {
      issues.push({
        code: 'CACHE-005',
        severity: 'LOW',
        section: 'FRESHNESS',
        message: '"max-age=0" used without "must-revalidate" or "no-cache". Some legacy proxies may serve stale content without revalidation.',
        recommendation: 'Use "Cache-Control: no-cache" or "max-age=0, must-revalidate" to guarantee synchronous validator checks with the origin.'
      });
    }

    // RULE 6: Missing validation validator (ETag or Last-Modified)
    if (parsedCc.maxAge !== undefined && parsedCc.maxAge > 0 && !etagHeader && !lastModifiedHeader) {
      issues.push({
        code: 'CACHE-006',
        severity: 'MEDIUM',
        section: 'FRESHNESS',
        message: 'Cacheable response lacks both "ETag" and "Last-Modified" validators. Conditional revalidation (304 Not Modified) is impossible.',
        recommendation: 'Include a strong ETag header (e.g., ETag: "sha256-hash") to enable efficient HTTP 304 revalidation and reduce egress costs.',
        headerKey: 'ETag'
      });
    }

    // RULE 7: immutable directive without sufficient max-age
    if (parsedCc.immutable && (parsedCc.maxAge === undefined || parsedCc.maxAge < 86400)) {
      issues.push({
        code: 'CACHE-007',
        severity: 'LOW',
        section: 'DIRECTIVES',
        message: '"immutable" directive used with low or missing max-age (< 24h). Immutable is intended for hashed assets with 1-year TTL (31536000s).',
        recommendation: 'Pair "immutable" with "max-age=31536000, public" for content-hashed assets (e.g. app.[hash].js).'
      });
    }

    // RULE 8: Missing stale-while-revalidate on high-traffic APIs
    if (parsedCc.isPublic && parsedCc.maxAge && parsedCc.maxAge > 0 && parsedCc.staleWhileRevalidate === undefined) {
      issues.push({
        code: 'CACHE-008',
        severity: 'INFO',
        section: 'FRESHNESS',
        message: 'No "stale-while-revalidate" window defined. Clients will experience latency spikes when cache TTL expires.',
        recommendation: 'Add "stale-while-revalidate=86400" (or similar window) to serve immediate stale content while asynchronously refreshing in the background.'
      });
    }

    // RULE 9: s-maxage on private responses
    if (parsedCc.isPrivate && parsedCc.sMaxAge !== undefined) {
      issues.push({
        code: 'CACHE-009',
        severity: 'MEDIUM',
        section: 'DIRECTIVES',
        message: '"s-maxage" directive specified on a "private" response. Shared proxies and CDNs will ignore s-maxage on private responses.',
        recommendation: 'Remove "s-maxage" from private responses or change directive to "public" if CDN proxy caching is intended.'
      });
    }

    // RULE 10: no-cache confused with no-store
    if (parsedCc.noCache && !parsedCc.noStore) {
      issues.push({
        code: 'CACHE-010',
        severity: 'INFO',
        section: 'DIRECTIVES',
        message: '"no-cache" directive allows caches to store responses, requiring validator revalidation before serving.',
        recommendation: 'If the resource contains sensitive data that must never touch disk or memory caches, use "no-store".'
      });
    }

    // RULE 11: Inconsistent Pragma: no-cache with HTTP/1.1
    if (pragmaHeader.toLowerCase().includes('no-cache') && !parsedCc.noCache && !parsedCc.noStore) {
      issues.push({
        code: 'CACHE-012',
        severity: 'LOW',
        section: 'DIRECTIVES',
        message: 'Legacy "Pragma: no-cache" header is present but contradicts modern "Cache-Control".',
        recommendation: 'Align HTTP/1.1 "Cache-Control" or omit the deprecated Pragma header.'
      });
    }

    // RULE 12: Missing CDN override
    const hasCdnHeader = Boolean(normalized['cdn-cache-control'] || normalized['cloudflare-cdn-cache-control']);
    if (parsedCc.isPublic && parsedCc.maxAge && parsedCc.maxAge > 60 && !hasCdnHeader) {
      issues.push({
        code: 'CACHE-013',
        severity: 'INFO',
        section: 'DIRECTIVES',
        message: 'Missing "CDN-Cache-Control" header. Upstream Edge CDN and downstream browser share the same TTL.',
        recommendation: 'Add "CDN-Cache-Control: max-age=86400" alongside a shorter browser "Cache-Control: max-age=60" for optimal multi-tiered caching.'
      });
    }

    // RULE 13: High TTL on error response
    if (statusCode >= 400 && (parsedCc.maxAge || 0) > 60) {
      issues.push({
        code: 'CACHE-014',
        severity: 'CRITICAL',
        section: 'SECURITY',
        message: `HTTP ${statusCode} error response cached for ${parsedCc.maxAge}s! Upstream clients will see persistent error outages even after origin recovery.`,
        recommendation: 'Set "Cache-Control: no-cache, no-store, must-revalidate" or low TTL (max-age=5) on error responses.'
      });
    }

    // RULE 14: Age header exceeds max-age
    if (ageHeader !== undefined && parsedCc.maxAge !== undefined && ageHeader > parsedCc.maxAge) {
      const isWithinSwr = parsedCc.staleWhileRevalidate && ageHeader <= (parsedCc.maxAge + parsedCc.staleWhileRevalidate);
      if (!isWithinSwr) {
        issues.push({
          code: 'CACHE-015',
          severity: 'HIGH',
          section: 'FRESHNESS',
          message: `Received Age (${ageHeader}s) exceeds max-age (${parsedCc.maxAge}s) outside allowable stale-while-revalidate window!`,
          recommendation: 'Verify upstream cache purge and proxy revalidation settings to eliminate permanently stale cache leaks.',
          headerKey: 'Age',
          receivedValue: String(ageHeader)
        });
      }
    }

    // RULE 15: Weak ETag on range requests
    if (etagHeader && etagHeader.startsWith('W/') && (normalized['accept-ranges'] === 'bytes' || normalized['content-range'])) {
      issues.push({
        code: 'CACHE-016',
        severity: 'LOW',
        section: 'FRESHNESS',
        message: 'Weak ETag (W/"...") used on byte-range capable endpoint. RFC 9111 requires a strong ETag for byte-range conditional requests.',
        recommendation: 'Use a strong byte-exact cryptographic ETag (without W/ prefix) for media or chunked byte-range assets.'
      });
    }

    // Calculate score (out of 100)
    let penalty = 0;
    for (const issue of issues) {
      if (issue.severity === 'CRITICAL') penalty += 35;
      else if (issue.severity === 'HIGH') penalty += 20;
      else if (issue.severity === 'MEDIUM') penalty += 10;
      else if (issue.severity === 'LOW') penalty += 4;
      else if (issue.severity === 'INFO') penalty += 1;
    }

    const score = Math.max(0, 100 - penalty);
    let grade: 'A+' | 'A' | 'B' | 'C' | 'F' = 'F';
    if (score >= 95) grade = 'A+';
    else if (score >= 85) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 50) grade = 'C';
    else grade = 'F';

    const isCdnOptimal = Boolean(score >= 85 && parsedCc.isPublic && parsedCc.staleWhileRevalidate !== undefined && etagHeader);

    return {
      url,
      statusCode,
      score,
      grade,
      parsedDirectives: parsedCc,
      issues,
      headers: normalized,
      isCdnOptimal,
      summary: {
        browserTtlSec: parsedCc.maxAge,
        cdnTtlSec: parsedCc.sMaxAge ?? parsedCc.maxAge,
        swrWindowSec: parsedCc.staleWhileRevalidate,
        hasVaryAuth: varyTokens.includes('authorization') || varyTokens.includes('cookie'),
        hasVaryEncoding: varyTokens.includes('accept-encoding'),
        hasETagOrLastModified: Boolean(etagHeader || lastModifiedHeader)
      }
    };
  }
}
