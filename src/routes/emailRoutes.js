import { Router } from 'express';
import { sendEmail } from '../services/emailService.js';
import {
  getIdempotentResponse,
  setIdempotentResponse,
} from '../middleware/idempotency.js';

const router = Router();

function logSendLine(to, outcome, extra = '') {
  console.log(
    `[${new Date().toISOString()}] [send] to=${to} outcome=${outcome}${extra ? ` ${extra}` : ''}`,
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

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
        return res.json(cached);
      }
    }

    if (!to || typeof to !== 'string') {
      const body = { success: false, error: 'Campo "to" es obligatorio.' };
      if (idempotencyKey) setIdempotentResponse(idempotencyKey, body);
      return res.status(400).json(body);
    }
    if (!subject || typeof subject !== 'string') {
      const body = { success: false, error: 'Campo "subject" es obligatorio.' };
      if (idempotencyKey) setIdempotentResponse(idempotencyKey, body);
      return res.status(400).json(body);
    }
    if (!html || typeof html !== 'string') {
      const body = { success: false, error: 'Campo "html" es obligatorio.' };
      if (idempotencyKey) setIdempotentResponse(idempotencyKey, body);
      return res.status(400).json(body);
    }

    const outcome = await sendEmail({ to, subject, html, from });
    if (outcome.success) {
      logSendLine(to, 'success', `messageId=${outcome.messageId}`);
    } else {
      logSendLine(to, 'failure', `error=${outcome.error}`);
    }

    if (idempotencyKey) setIdempotentResponse(idempotencyKey, outcome);
    return res.status(200).json(outcome);
  } catch (err) {
    const body = {
      success: false,
      error: err?.message || String(err),
    };
    console.error(`[${new Date().toISOString()}] [send] unexpected`, err);
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
      logSendLine(
        r.to,
        r.success ? 'success' : 'failure',
        r.success ? `messageId=${r.messageId}` : `error=${r.error}`,
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
