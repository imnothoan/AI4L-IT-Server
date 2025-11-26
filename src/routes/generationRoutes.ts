import express from 'express';
import { generateQuestions, calibrateQuestions } from '../controllers/generationController.js';
import { authMiddleware as protect, requireRole as authorize } from '../middleware/auth.js';

const router = express.Router();

// AI Question Generation
router.post('/questions', protect, authorize('instructor', 'admin'), generateQuestions);

// IRT Calibration
router.post('/calibrate', protect, authorize('instructor', 'admin'), calibrateQuestions);

export default router;
