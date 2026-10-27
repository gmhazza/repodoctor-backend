import { Router } from 'express';
import { env } from '../config/env.js';

const router = Router();

function healthResponse(req, res) {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.NODE_ENV,
    concurrency: env.GEMINI_CONCURRENCY,
    model: env.GEMINI_MODEL,
  });
}

// Provide a useful response at the deployment URL as well as the health-check path.
router.get('/', healthResponse);
router.get('/health', healthResponse);

export default router;
