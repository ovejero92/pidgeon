/**
 * Límite global por IP: ventana deslizante de `windowMs`, máximo `maxPerWindow` peticiones.
 */
const ipBuckets = new Map();

function pruneBucket(timestamps, windowMs, now) {
  const cutoff = now - windowMs;
  while (timestamps.length && timestamps[0] < cutoff) timestamps.shift();
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function createGlobalIpRateLimiter({
  windowMs = 60_000,
  maxPerWindow = 20,
  skip = () => false,
} = {}) {
  return function globalIpRateLimiter(req, res, next) {
    if (skip(req)) return next();

    const ip = getClientIp(req);
    const now = Date.now();
    let bucket = ipBuckets.get(ip);
    if (!bucket) {
      bucket = [];
      ipBuckets.set(ip, bucket);
    }
    pruneBucket(bucket, windowMs, now);

    if (bucket.length >= maxPerWindow) {
      const retryAfterSec = Math.ceil(
        Math.max(0, bucket[0] + windowMs - now) / 1000,
      );
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
      return res.status(429).json({
        success: false,
        error: `Límite de ${maxPerWindow} peticiones por minuto por IP excedido.`,
      });
    }

    bucket.push(now);
    next();
  };
}
