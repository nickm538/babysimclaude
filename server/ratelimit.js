// Tiny in-memory rate limiter (per key, sliding window). Enough for a single-instance deployment.
export function rateLimit({ windowMs = 60000, max = 30, key = (req) => req.ip } = {}) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, arr] of hits) { const keep = arr.filter((t) => now - t < windowMs); if (keep.length) hits.set(k, keep); else hits.delete(k); } }, windowMs).unref();
  return (req, res, next) => {
    const k = key(req); const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { res.setHeader('Retry-After', Math.ceil(windowMs / 1000)); return res.status(429).json({ error: 'Too many requests — slow down a little.' }); }
    arr.push(now); hits.set(k, arr); next();
  };
}
