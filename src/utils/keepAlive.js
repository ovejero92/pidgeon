/**
 * Lanza un GET periódico a /health usando la URL pública del servicio.
 * En Render suele existir RENDER_EXTERNAL_URL; en local puede usarse PUBLIC_URL o localhost.
 */
export function startKeepAlive(opts = {}) {
  const intervalMs = opts.intervalMs ?? 10 * 60 * 1000;
  const port = opts.port ?? process.env.PORT ?? 3000;

  const baseUrl =
    process.env.RENDER_EXTERNAL_URL?.replace(/\/$/, '') ||
    process.env.PUBLIC_URL?.replace(/\/$/, '') ||
    `http://127.0.0.1:${port}`;

  async function ping() {
    const url = `${baseUrl}/health`;
    try {
      const res = await fetch(url, { method: 'GET' });
      const ok = res.ok;
      console.log(
        `[${new Date().toISOString()}] [keep-alive] GET ${url} → ${res.status} ${ok ? 'OK' : 'FAIL'}`,
      );
    } catch (err) {
      console.warn(
        `[${new Date().toISOString()}] [keep-alive] falló ping a ${url}:`,
        err?.message || err,
      );
    }
  }

  const timer = setInterval(ping, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  // Primera comprobación poco después del arranque para validar URL en producción.
  setTimeout(ping, 30_000);

  return () => clearInterval(timer);
}
