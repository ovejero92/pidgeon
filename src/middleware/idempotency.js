/**
 * Cache en memoria para /send: misma idempotencyKey en ventana de 5 min → misma respuesta.
 * @type {Map<string, { expiresAt: number, statusCode: number, body: object }>}
 */
const idempotencyStore = new Map();

const WINDOW_MS = 5 * 60 * 1000;

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore.entries()) {
    if (entry.expiresAt <= now) idempotencyStore.delete(key);
  }
}

/**
 * @returns {{ statusCode: number, body: object } | null}
 */
export function getIdempotentResponse(key) {
  if (!key || typeof key !== 'string') return null;
  pruneExpired();
  const hit = idempotencyStore.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return { statusCode: hit.statusCode, body: hit.body };
}

export function setIdempotentResponse(key, statusCode, body) {
  if (!key || typeof key !== 'string') return;
  idempotencyStore.set(key, {
    expiresAt: Date.now() + WINDOW_MS,
    statusCode,
    body,
  });
}
