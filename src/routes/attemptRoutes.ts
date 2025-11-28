import express from 'express';
import { catController } from '../controllers/catController.js';
import * as attemptController from '../controllers/attemptController.js';
import { getExamStatistics, getQuestionAnalytics, getStudentPerformance, getActiveSessions, getFlaggedAttempts } from '../controllers/analyticsController.js';
import { authMiddleware as protect, requireRole as authorize } from '../middleware/auth.js';

const router = express.Router();

// Attempt Management Routes
router.get('/instructor', protect, authorize('instructor'), attemptController.getInstructorAttempts);
router.get('/:id', protect, attemptController.getExamAttempt);

// Attempt Lifecycle Routes
router.post('/', protect, authorize('student'), attemptController.startExamAttempt);
router.post('/:attemptId/submit', protect, authorize('student'), attemptController.submitAnswer);
router.post('/:attemptId/complete', protect, authorize('student'), attemptController.completeExamAttempt);
router.post('/:attemptId/warnings', protect, authorize('student'), attemptController.submitWarning);
router.get('/:attemptId/next-question', protect, authorize('student'), attemptController.getNextQuestion);

// Analytics Routes (Instructor only)
router.get('/exams/:examId/statistics', protect, authorize('instructor', 'admin'), getExamStatistics);
router.get('/exams/:examId/analytics/questions', protect, authorize('instructor', 'admin'), getQuestionAnalytics);
router.get('/students/:studentId/performance', protect, authorize('instructor', 'admin', 'student'), getStudentPerformance);
router.get('/exams/:examId/sessions/active', protect, authorize('instructor', 'admin'), getActiveSessions);
router.get('/exams/:examId/attempts/flagged', protect, authorize('instructor', 'admin'), getFlaggedAttempts);

export default router;
