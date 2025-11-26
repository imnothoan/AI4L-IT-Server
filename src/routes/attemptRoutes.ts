import express from 'express';
import { catController } from '../controllers/catController.js';
import { getExamStatistics, getQuestionAnalytics, getStudentPerformance, getActiveSessions, getFlaggedAttempts } from '../controllers/analyticsController.js';
import { authMiddleware as protect, requireRole as authorize } from '../middleware/auth.js';

const router = express.Router();

// CAT Session Routes
router.post('/start', protect, authorize('student'), catController.startExam);
router.post('/submit', protect, authorize('student'), catController.submitAnswer);
// router.post('/next', protect, authorize('student'), catController.nextQuestion); // Removed as next is handled in submit

// Analytics Routes (Instructor only)
router.get('/exams/:examId/statistics', protect, authorize('instructor', 'admin'), getExamStatistics);
router.get('/exams/:examId/analytics/questions', protect, authorize('instructor', 'admin'), getQuestionAnalytics);
router.get('/students/:studentId/performance', protect, authorize('instructor', 'admin', 'student'), getStudentPerformance);
router.get('/exams/:examId/sessions/active', protect, authorize('instructor', 'admin'), getActiveSessions);
router.get('/exams/:examId/attempts/flagged', protect, authorize('instructor', 'admin'), getFlaggedAttempts);

export default router;
