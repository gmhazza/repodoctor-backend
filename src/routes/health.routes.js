import { Router } from 'express';
import { env } from '../config/env.js';

const router = Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.NODE_ENV,
    concurrency: env.GEMINI_CONCURRENCY,
    model: env.GEMINI_MODEL,
  });
});

export default router;
