# RFC 9111 HTTP Caching Rules in CacheSmith

CacheSmith audits 16 rules across 5 categories:

1. **CACHE-001 (High):** Missing `Cache-Control` header.
2. **CACHE-002 (Critical):** Conflicting `no-store` with `max-age` or `public`.
3. **CACHE-003 (Medium):** Compressible content lacking `Vary: Accept-Encoding`.
4. **CACHE-004 (Critical):** `Cache-Control: public` combined with `Set-Cookie`.
5. **CACHE-005 (Low):** `max-age=0` without `must-revalidate` or `no-cache`.
6. **CACHE-006 (Medium):** Missing `ETag` or `Last-Modified` validator.
7. **CACHE-007 (Low):** `immutable` directive with sub-year TTL.
8. **CACHE-008 (Info):** Missing `stale-while-revalidate` on public assets.
9. **CACHE-009 (Medium):** `s-maxage` specified on private responses.
10. **CACHE-010 (Info):** `no-cache` directive usage semantics.
11. **CACHE-012 (Low):** Deprecated `Pragma: no-cache` with HTTP/1.1.
12. **CACHE-013 (Info):** Missing `CDN-Cache-Control` tiered override.
13. **CACHE-014 (Critical):** Long TTL on HTTP 4xx/5xx error responses.
14. **CACHE-015 (High):** Received `Age` exceeding `max-age` without SWR.
15. **CACHE-016 (Low):** Weak `ETag` on byte-range enabled endpoints.
