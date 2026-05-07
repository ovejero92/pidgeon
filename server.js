import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import emailRoutes from './src/routes/emailRoutes.js';
import { createGlobalIpRateLimiter } from './src/middleware/globalRateLimit.js';

const app = express();
const PORT = Number(process.env.PORT);
const listenPort = Number.isFinite(PORT) && PORT > 0 ? PORT : 3000;

if (!process.env.RESEND_API_KEY?.trim()) {
  console.warn(
    `[${new Date().toISOString()}] WARN: RESEND_API_KEY no está definida; arrancando en modo simulado (mock).`,
  );
}

app.use(
  cors({
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  }),
);
app.use(express.json({ limit: '512kb' }));

const globalRateLimiter = createGlobalIpRateLimiter({
  windowMs: 60_000,
  maxPerWindow: 20,
  skip: (req) =>
    req.method === 'GET' &&
    (req.path === '/' || req.path === '/health'),
});

app.use(globalRateLimiter);

app.use(emailRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

const server = app.listen(listenPort, '0.0.0.0', () => {
  console.log(
    `[${new Date().toISOString()}] Pidgeon listening on 0.0.0.0:${listenPort}`,
  );
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `[${new Date().toISOString()}] ERROR: El puerto ${listenPort} ya está en uso.\n` +
        `  Suele ser otra instancia de este servidor: cierra esa terminal o mata el proceso.\n` +
        `  Windows (PowerShell): Get-NetTCPConnection -LocalPort ${listenPort} | Select OwningProcess\n` +
        `  Windows (CMD): netstat -ano | findstr ":${listenPort}"\n` +
        `  Luego: taskkill /PID <pid> /F\n` +
        `  Alternativa: otro puerto → PowerShell: $env:PORT='3001'; npm start`,
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
