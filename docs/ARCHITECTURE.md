# CacheSmith System Architecture

CacheSmith is an edge HTTP caching linter, key normalizer, and stampede resilience engine.

```
       +-----------------------+
       |   Incoming Request    |
       +-----------+-----------+
                   |
                   v
       +-----------------------+
       |  CacheKeyNormalizer   | (Strip tracking params, sort query keys)
       +-----------+-----------+
                   |
                   v
       +-----------------------+
       |   CacheEngine         |
       | - Naive               |
       | - Mutex Singleflight  |
       | - XFetch Probabilistic|
       +-----------+-----------+
          /                 \
   (HIT/STALE)             (MISS)
        v                     v
   Return Client       Fetch Origin / Recompute
```

## Core Components
1. **CacheEngine:** Thread-safe in-memory cache supporting Naive, Singleflight Mutex, and XFetch algorithms.
2. **CacheLinter:** Inspects HTTP responses against 16 RFC 9111 rules.
3. **KeyNormalizer:** Canonical query ordering and SHA-256 key generation.
4. **CacheProxy:** Reverse proxy on port 8086.
5. **StudioServer:** Bento Grid dashboard on port 6969.
