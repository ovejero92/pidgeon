/**
 * Almacena marcas de tiempo por IP para cada “unidad de correo” enviada.
 * Ventana deslizante de 60s; máximo `maxPerWindow` correos por IP en ese minuto.
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

/**
 * Middleware: cuenta cuántos correos representa la petición actual y valida el cupo por IP.
 */
export function createEmailRateLimiter({ windowMs = 60_000, maxPerWindow = 10 } = {}) {
  return function emailRateLimiter(req, res, next) {
    const n = countEmailsForRequest(req);
    if (n <= 0) return next();

    const ip = getClientIp(req);
    const now = Date.now();
    let bucket = ipBuckets.get(ip);
    if (!bucket) {
      bucket = [];
      ipBuckets.set(ip, bucket);
    }
    pruneBucket(bucket, windowMs, now);

    if (bucket.length + n > maxPerWindow) {
      const retryAfterSec = Math.ceil(
        (bucket[0] + windowMs - now) / 1000,
      );
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
      return res.status(429).json({
        success: false,
        error: `Límite de ${maxPerWindow} correos por minuto por IP excedido.`,
      });
    }

    for (let i = 0; i < n; i += 1) bucket.push(now);
    next();
  };
}

/**
 * POST /send cuenta como 1 correo; POST /send-batch cuenta como recipients.length.
 */
function countEmailsForRequest(req) {
  if (req.method !== 'POST') return 0;
  const path = req.path || req.url?.split('?')[0] || '';
  if (path === '/send') return 1;
  if (path === '/send-batch') {
    const list = req.body?.recipients;
    return Array.isArray(list) ? list.length : 0;
  }
  return 0;
}
