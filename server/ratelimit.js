// Tiny in-memory token bucket, keyed by client IP. Enough for a single-node
// home/demo server; swap for a shared store if you run several instances.

export function rateLimit({ perMinute = 8, burst = perMinute } = {}) {
  const buckets = new Map();
  const refillPerMs = perMinute / 60_000;
  const sweep = setInterval(() => {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [k, b] of buckets) if (b.at < cutoff) buckets.delete(k);
  }, 60_000);
  sweep.unref();

  return function limiter(req, res, next) {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const b = buckets.get(key) || { tokens: burst, at: now };
    b.tokens = Math.min(burst, b.tokens + (now - b.at) * refillPerMs);
    b.at = now;
    if (b.tokens < 1) {
      const retry = Math.ceil((1 - b.tokens) / refillPerMs / 1000);
      res.set('Retry-After', String(retry));
      buckets.set(key, b);
      return res.status(429).json({ error: `Whoa, so many ideas! Try again in ${retry} seconds.` });
    }
    b.tokens -= 1;
    buckets.set(key, b);
    next();
  };
}
