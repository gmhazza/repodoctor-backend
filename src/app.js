import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from 'dotenv';
import analyzeRoutes from './routes/analyze.routes.js';
import healthRoutes from './routes/health.routes.js';
import mailRoutes from './routes/mail.route.js'
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';
import { logger } from './utils/logger.js';

config();

export function createApp() {
  const app = express();

  // Security Headers
  app.use(helmet());

  // CORS Configuration
  app.use(
    cors({
      origin: `${process.env.CORS_ORIGIN}`,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Strict Request Body Limit
  app.use(express.json({ limit: '100kb' }));

  // Request logger middleware (logs method & path, never secrets or body payloads)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info(
        {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
        },
        'HTTP request completed'
      );
    });
    next();
  });

  // Mount API Routes
  app.use('/api', analyzeRoutes);
  app.use('/mail', mailRoutes);
  app.use('/', healthRoutes);

  // 404 Route Handler
  app.use(notFoundHandler);

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export default createApp();
