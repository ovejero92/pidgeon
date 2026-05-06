/**
 * Cache en memoria para /send: misma idempotencyKey en ventana de 5 min → misma respuesta JSON.
 * @type {Map<string, { expiresAt: number, body: object }>}
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
 * Si existe resultado cacheado válido para la key, lo devuelve; si no, devuelve null.
 */
export function getIdempotentResponse(key) {
  if (!key || typeof key !== 'string') return null;
  pruneExpired();
  const hit = idempotencyStore.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.body;
}

/**
 * Guarda la respuesta JSON exacta que debe repetirse ante replays de la misma key.
 */
export function setIdempotentResponse(key, body) {
  if (!key || typeof key !== 'string') return;
  idempotencyStore.set(key, {
    expiresAt: Date.now() + WINDOW_MS,
    body,
  });
}
