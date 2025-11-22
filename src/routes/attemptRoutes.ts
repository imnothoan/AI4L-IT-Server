import { Router } from 'express';
import * as attemptController from '../controllers/attemptController.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validation.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Start exam attempt (student only)
router.post('/start', requireRole('student'), attemptController.startExamAttempt);

// Get next question for CAT (student only)
router.get('/:attemptId/next-question', requireRole('student'), attemptController.getNextQuestion);

// Submit answer (student only)
router.post(
  '/:attemptId/submit-answer',
  requireRole('student'),
  validate(schemas.submitAnswer),
  attemptController.submitAnswer
);

// Submit anti-cheat warning (student only)
router.post(
  '/:attemptId/submit-warning',
  requireRole('student'),
  validate(schemas.submitWarning),
  attemptController.submitWarning
);

// Complete exam attempt (student only)
router.post('/:attemptId/complete', requireRole('student'), attemptController.completeExamAttempt);

// Get specific attempt
router.get('/:id', attemptController.getExamAttempt);

// Get all attempts for an exam (instructor only)
router.get('/exam/:examId', requireRole('instructor'), attemptController.getExamAttempts);

// Get student's attempts
router.get('/student/:studentId?', attemptController.getStudentAttempts);

export default router;
