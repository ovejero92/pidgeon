import express from 'express';
import { configureCors } from './middleware/cors.js';
import { createEmailRateLimiter } from './middleware/rateLimit.js';
import emailRoutes from './routes/emailRoutes.js';
import { startKeepAlive } from './utils/keepAlive.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(configureCors());
app.use(express.json({ limit: '512kb' }));

const emailRateLimiter = createEmailRateLimiter({
  windowMs: 60_000,
  maxPerWindow: 10,
});

app.use((req, res, next) => {
  if (req.path === '/send' || req.path === '/send-batch') {
    return emailRateLimiter(req, res, next);
  }
  return next();
});

app.use(emailRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(
    `[${new Date().toISOString()}] Pidgeon listening on port ${PORT} (DOMAIN=${process.env.DOMAIN || 'turnosok.com'})`,
  );
  startKeepAlive({ port: PORT });
});
