import { Router } from 'express';
import * as questionController from '../controllers/questionController.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validation.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get questions (with filters and pagination)
router.get('/', validate(schemas.pagination, 'query'), questionController.getQuestions);

// Get single question
router.get('/:id', questionController.getQuestion);

// Create question (instructor only)
router.post(
  '/',
  requireRole('instructor'),
  validate(schemas.createQuestion),
  questionController.createQuestion
);

// Generate questions with AI (instructor only)
router.post(
  '/generate',
  requireRole('instructor'),
  validate(schemas.generateQuestions),
  questionController.generateQuestions
);

// Bulk import questions (instructor only)
router.post(
  '/bulk-import',
  requireRole('instructor'),
  questionController.bulkImportQuestions
);

// Get questions by IDs
router.post('/by-ids', questionController.getQuestionsByIds);

// Update question
router.put('/:id', questionController.updateQuestion);

// Delete question
router.delete('/:id', questionController.deleteQuestion);

export default router;
