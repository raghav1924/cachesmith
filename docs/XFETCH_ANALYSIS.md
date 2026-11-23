# Optimal Probabilistic Early Expiration (XFetch)

## The Stampede Challenge
When high-traffic cache entries expire, all concurrent incoming requests face a cache miss at the same millisecond. This causes the database to receive hundreds of identical queries simultaneously.

## The Mathematical Mechanism
XFetch evaluates:
`now - beta * delta * ln(u) > expiry`

Where:
- `beta >= 1.0` is the aggressiveness parameter.
- `delta` is the computation duration in milliseconds.
- `u` is uniform random in (0, 1].

As `now` approaches `expiry`, the logarithmic penalty increases the probability of an early recomputation trigger. The single worker that triggers the threshold recomputes the data in the background, updating the cache seamlessly without user-facing stalls.
