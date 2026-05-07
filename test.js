/**
 * Pruebas HTTP contra Pidgeon.
 * Uso: tener el servidor en marcha (`npm start`), luego `npm test`.
 * Opcional: BASE_URL=http://127.0.0.1:3000 node test.js
 */

const BASE =
  process.env.BASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000';

async function jsonFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { res, body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

async function main() {
  console.log(`Tests contra ${BASE}\n`);

  const health = await jsonFetch('/health');
  assert(health.res.ok, `GET /health status ${health.res.status}`);
  assert(health.body?.status === 'ok', 'health.status debe ser ok');
  assert(typeof health.body?.timestamp === 'string', 'health.timestamp ISO');
  assert(Number.isFinite(health.body?.uptime), 'health.uptime debe ser número (segundos)');
  console.log('✓ GET /health');

  const root = await jsonFetch('/');
  assert(root.res.ok, `GET / status ${root.res.status}`);
  assert(
    root.body?.message?.includes('Pidgeon'),
    'GET / debe incluir mensaje del servicio',
  );
  console.log('✓ GET /');

  const idemKey = `test-${Date.now()}`;
  const sendBody = {
    to: 'test@example.com',
    subject: 'Pidgeon test',
    html: '<p>Hola desde test.js</p>',
    idempotencyKey: idemKey,
  };

  const send1 = await jsonFetch('/send', {
    method: 'POST',
    body: JSON.stringify(sendBody),
  });
  assert(send1.res.ok, `POST /send status ${send1.res.status}`);
  assert(send1.body?.success === true, 'send debe tener success true (mock o Resend)');
  assert(send1.body?.messageId, 'send debe incluir messageId');
  console.log('✓ POST /send');

  const send2 = await jsonFetch('/send', {
    method: 'POST',
    body: JSON.stringify(sendBody),
  });
  assert(send2.res.ok, `POST /send idempotent status ${send2.res.status}`);
  assert(
    send2.body?.messageId === send1.body?.messageId,
    'idempotency debe devolver el mismo messageId',
  );
  console.log('✓ POST /send idempotencia');

  const batch = await jsonFetch('/send-batch', {
    method: 'POST',
    body: JSON.stringify({
      recipients: ['a@example.com', 'b@example.com'],
      subject: 'Batch test',
      html: '<p>Batch</p>',
    }),
  });
  assert(batch.res.ok, `POST /send-batch status ${batch.res.status}`);
  assert(Array.isArray(batch.body?.results), 'send-batch debe incluir results');
  assert(batch.body?.results?.length === 2, 'send-batch 2 resultados');
  console.log('✓ POST /send-batch');

  console.log('\nTodos los tests pasaron.');
}

main().catch((err) => {
  console.error('\nFalló:', err.message);
  process.exitCode = 1;
});
