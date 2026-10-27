import { Router } from 'express';
import { analyzeController } from '../controllers/analyze.controller.js';
import { validateAnalyzeRequest } from '../middleware/validation.middleware.js';
import { apiRateLimiter } from '../middleware/rate-limit.middleware.js';
import { auth } from '../middleware/auth.middleware.js'

const router = Router();

router.post('/analyze', auth, apiRateLimiter, validateAnalyzeRequest, analyzeController.analyze);

export default router;
