import { Resend } from 'resend';

const RETRY_DELAY_MS = 2000;

/** Cliente Resend singleton cuando existe API key (evita recrear el SDK en cada correo). */
let resendSingleton = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDefaultFrom() {
  const domain = process.env.DOMAIN || 'turnosok.com';
  return `noreply@${domain}`;
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  if (!resendSingleton) resendSingleton = new Resend(apiKey);
  return resendSingleton;
}

/**
 * Envío real con Resend o simulación por consola si no hay API key.
 */
async function sendOnce({ to, subject, html, from }) {
  const fromAddr = from || getDefaultFrom();
  const resend = getResendClient();

  if (!resend) {
    const messageId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    console.log(
      `[${new Date().toISOString()}] [MOCK SEND] to=${to} from=${fromAddr} subject="${subject}" messageId=${messageId}`,
    );
    return { success: true, messageId };
  }

  const { data, error } = await resend.emails.send({
    from: fromAddr,
    to: [to],
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message || String(error));
  }

  return { success: true, messageId: data?.id || 'unknown' };
}

/**
 * Un intento + un reintento tras 2s si falla (requisito de robustez).
 */
export async function sendEmail(payload) {
  try {
    return await sendOnce(payload);
  } catch (firstErr) {
    await sleep(RETRY_DELAY_MS);
    try {
      return await sendOnce(payload);
    } catch (secondErr) {
      const msg = secondErr?.message || String(secondErr);
      return { success: false, error: msg };
    }
  }
}
