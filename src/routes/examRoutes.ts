import { Router } from 'express';
import * as examController from '../controllers/examController.js';
import * as analyticsController from '../controllers/analyticsController.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validation.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get exams
router.get('/', validate(schemas.pagination, 'query'), examController.getExams);

// Get single exam
router.get('/:id', examController.getExam);

// Create exam (instructor only)
router.post(
  '/',
  requireRole('instructor'),
  validate(schemas.createExam),
  examController.createExam
);

// Update exam (instructor only)
router.put('/:id', requireRole('instructor'), examController.updateExam);

// Delete exam (instructor only)
router.delete('/:id', requireRole('instructor'), examController.deleteExam);

// Assign exam to class (instructor only)
router.post('/assign', requireRole('instructor'), examController.assignExamToClass);

// Analytics endpoints (instructor only)
router.get('/:examId/statistics', requireRole('instructor'), analyticsController.getExamStatistics);
router.get('/:examId/analytics/questions', requireRole('instructor'), analyticsController.getQuestionAnalytics);
router.get('/:examId/sessions/active', requireRole('instructor'), analyticsController.getActiveSessions);
router.get('/:examId/attempts/flagged', requireRole('instructor'), analyticsController.getFlaggedAttempts);

export default router;
