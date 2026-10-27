import app from './app.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, validateEnv } from './config/env.js';
import { logger } from './utils/logger.js';

try {
  validateEnv();
} catch (error) {
  logger.error({ error: error.message }, 'Failed environment validation');
  throw error;
}

// Vercel invokes this Express application directly as a serverless function.
export default app;

// Keep a listener only for local `npm start`; Vercel owns the listener in production.
const isDirectExecution =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectExecution) {
  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        model: env.GEMINI_MODEL,
        concurrency: env.GEMINI_CONCURRENCY,
      },
      `Repo Doctor backend is running on http://localhost:${env.PORT}`
    );
  });

  // Graceful shutdown is only needed when this process owns the HTTP server.
  function shutdown(signal) {
    logger.info({ signal }, 'Received shutdown signal, terminating gracefully...');
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });

    // Force close after 10 seconds if hanging
    setTimeout(() => {
      logger.error('Forcing shutdown after timeout.');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason: reason instanceof Error ? reason.message : reason }, 'Unhandled Rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught Exception');
    process.exit(1);
  });
}
