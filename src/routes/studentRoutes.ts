import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get student performance
router.get('/:studentId/performance', analyticsController.getStudentPerformance);

export default router;
