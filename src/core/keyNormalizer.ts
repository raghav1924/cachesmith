/**
 * CacheSmith Cache Key Normalizer & Cardinality Analyzer
 * Eliminates cache fragmentation from query string reordering, tracking params, and casing.
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import { createHash } from 'crypto';
import { NormalizedKeyResult } from '../types.js';

export const COMMON_TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_eid',
  '_ga',
  '_gl',
  'ref',
  'ref_src',
  'srsltid',
  'igshid'
]);

export class CacheKeyNormalizer {
  /**
   * Normalize an incoming request URL to generate an optimal, collision-free cache key
   */
  static normalize(rawUrl: string, customStripParams: string[] = []): NormalizedKeyResult {
    const stripSet = new Set([...COMMON_TRACKING_PARAMS, ...customStripParams.map((p) => p.toLowerCase())]);
    let urlObj: URL;

    try {
      urlObj = new URL(rawUrl.startsWith('http') ? rawUrl : `https://localhost${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`);
    } catch {
      urlObj = new URL('https://localhost/');
    }

    const strippedTrackingParams: string[] = [];
    const validParams: [string, string][] = [];

    // Process query params
    urlObj.searchParams.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (stripSet.has(lowerKey)) {
        strippedTrackingParams.push(key);
      } else {
        validParams.push([key, value]);
      }
    });

    // Sort params alphabetically by key, then value
    validParams.sort((a, b) => {
      const cmp = a[0].localeCompare(b[0]);
      if (cmp !== 0) return cmp;
      return a[1].localeCompare(b[1]);
    });

    // Rebuild normalized URL
    let path = urlObj.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    const newSearchParams = new URLSearchParams();
    for (const [k, v] of validParams) {
      newSearchParams.append(k, v);
    }

    const queryString = newSearchParams.toString();
    const normalizedUrl = `${urlObj.origin.toLowerCase()}${path}${queryString ? `?${queryString}` : ''}`;

    // Compute SHA-256
    const cacheKeySha256 = createHash('sha256').update(normalizedUrl).digest('hex');

    // Cardinality Risk Assessment
    let cardinalityRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    let explanation = 'Safe parameter cardinality: URL is stable and well-suited for high-hit CDN caching.';

    const dynamicTimestampRegex = /^\d{10,13}$/;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let hasHighEntropyParam = false;

    for (const [k, v] of validParams) {
      if (dynamicTimestampRegex.test(v) || uuidRegex.test(v) || k.toLowerCase() === 'timestamp' || k.toLowerCase() === 'nonce' || k.toLowerCase() === 't') {
        hasHighEntropyParam = true;
        break;
      }
    }

    if (hasHighEntropyParam) {
      cardinalityRisk = 'HIGH';
      explanation = 'High cardinality risk detected! Query contains timestamp, nonce, or UUID value which will cause 0% cache hit ratio and cache memory bloat.';
    } else if (validParams.length > 8) {
      cardinalityRisk = 'MEDIUM';
      explanation = `Moderate cardinality risk: ${validParams.length} query parameters. Ensure parameters are whitelisted to maximize CDN hit ratio.`;
    }

    return {
      originalUrl: rawUrl,
      normalizedUrl,
      cacheKeySha256,
      strippedTrackingParams,
      sortedParamsCount: validParams.length,
      cardinalityRisk,
      explanation
    };
  }
}
