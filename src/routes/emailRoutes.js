import { Router } from 'express';
import { sendEmail } from '../services/emailService.js';
import {
  getIdempotentResponse,
  setIdempotentResponse,
} from '../middleware/idempotency.js';

const router = Router();

function logSendRequest(to, outcome, extra = '') {
  console.log(
    `[${new Date().toISOString()}] [/send] destinatario=${to} resultado=${outcome}${extra ? ` ${extra}` : ''}`,
  );
}

/**
 * Limita el paralelismo de envíos masivos: hasta 5 destinatarios por segundo.
 */
async function sendInBatchesPerSecond(recipients, payloadFactory, batchSize = 5, delayMs = 1000) {
  const results = [];
  for (let i = 0; i < recipients.length; i += batchSize) {
    const slice = recipients.slice(i, i + batchSize);
    const chunk = await Promise.all(
      slice.map(async (to) => {
        const result = await sendEmail(payloadFactory(to));
        return { to, ...result };
      }),
    );
    results.push(...chunk);
    if (i + batchSize < recipients.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

router.get('/', (_req, res) => {
  res.json({
    message: 'Pidgeon Email Service is running',
    version: '1.0',
  });
});

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

router.post('/send', async (req, res) => {
  try {
    const { to, subject, html, from, idempotencyKey } = req.body || {};

    if (idempotencyKey) {
      const cached = getIdempotentResponse(idempotencyKey);
      if (cached) {
        console.log(
          `[${new Date().toISOString()}] [idempotency] replay key=${idempotencyKey}`,
        );
        return res.status(cached.statusCode).json(cached.body);
      }
    }

    if (!to || typeof to !== 'string') {
      const body = { success: false, error: 'Campo "to" es obligatorio.' };
      if (idempotencyKey) setIdempotentResponse(idempotencyKey, 400, body);
      return res.status(400).json(body);
    }
    if (!subject || typeof subject !== 'string') {
      const body = { success: false, error: 'Campo "subject" es obligatorio.' };
      if (idempotencyKey) setIdempotentResponse(idempotencyKey, 400, body);
      return res.status(400).json(body);
    }
    if (!html || typeof html !== 'string') {
      const body = { success: false, error: 'Campo "html" es obligatorio.' };
      if (idempotencyKey) setIdempotentResponse(idempotencyKey, 400, body);
      return res.status(400).json(body);
    }

    const outcome = await sendEmail({ to, subject, html, from });
    if (outcome.success) {
      logSendRequest(to, 'éxito', `messageId=${outcome.messageId}`);
      if (idempotencyKey) setIdempotentResponse(idempotencyKey, 200, outcome);
      return res.status(200).json(outcome);
    }

    logSendRequest(to, 'fallo', `error=${outcome.error}`);
    if (idempotencyKey) setIdempotentResponse(idempotencyKey, 500, outcome);
    return res.status(500).json(outcome);
  } catch (err) {
    const body = {
      success: false,
      error: err?.message || String(err),
    };
    console.error(`[${new Date().toISOString()}] [/send] error inesperado`, err);
    const key = req.body?.idempotencyKey;
    if (key && typeof key === 'string') setIdempotentResponse(key, 500, body);
    return res.status(500).json(body);
  }
});

router.post('/send-batch', async (req, res) => {
  try {
    const { recipients, subject, html, from } = req.body || {};

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: '"recipients" debe ser un array no vacío de emails.',
      });
    }
    if (!subject || typeof subject !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Campo "subject" es obligatorio.',
      });
    }
    if (!html || typeof html !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Campo "html" es obligatorio.',
      });
    }

    const invalid = recipients.filter((r) => typeof r !== 'string' || !r.includes('@'));
    if (invalid.length) {
      return res.status(400).json({
        success: false,
        error: 'Todos los recipients deben ser strings con formato de email.',
      });
    }

    const rows = await sendInBatchesPerSecond(recipients, (to) => ({
      to,
      subject,
      html,
      from,
    }));

    const failures = rows.filter((r) => !r.success);
    rows.forEach((r) => {
      const resultado = r.success ? 'éxito' : 'fallo';
      const extra = r.success ? `messageId=${r.messageId}` : `error=${r.error}`;
      console.log(
        `[${new Date().toISOString()}] [send-batch] destinatario=${r.to} resultado=${resultado} ${extra}`,
      );
    });

    return res.json({
      success: failures.length === 0,
      sent: rows.length - failures.length,
      failed: failures.length,
      results: rows,
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [send-batch] unexpected`, err);
    return res.status(500).json({
      success: false,
      error: err?.message || String(err),
    });
  }
});

export default router;
