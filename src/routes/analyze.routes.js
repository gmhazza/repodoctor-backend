import { Router } from 'express';
import { analyzeController } from '../controllers/analyze.controller.js';
import { validateAnalyzeRequest } from '../middleware/validation.middleware.js';
import { apiRateLimiter } from '../middleware/rate-limit.middleware.js';

const router = Router();

router.post('/analyze', apiRateLimiter, validateAnalyzeRequest, analyzeController.analyze);

export default router;
