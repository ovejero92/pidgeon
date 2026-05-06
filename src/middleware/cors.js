import cors from 'cors';

/**
 * Permite que cualquier origen consuma la API (frontends y backends de otros proyectos).
 */
export function configureCors() {
  return cors({
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  });
}
