import { Router } from 'express';
import * as classController from '../controllers/classController.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validation.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get classes
router.get('/', validate(schemas.pagination, 'query'), classController.getClasses);

// Get single class
router.get('/:id', classController.getClass);

// Get class students
router.get('/:id/students', classController.getClassStudents);

// Get class exams
router.get('/:id/exams', classController.getClassExams);

// Create class (instructor only)
router.post(
  '/',
  requireRole('instructor'),
  validate(schemas.createClass),
  classController.createClass
);

// Update class (instructor only)
router.put('/:id', requireRole('instructor'), classController.updateClass);

// Delete class (instructor only)
router.delete('/:id', requireRole('instructor'), classController.deleteClass);

// Add student to class (instructor only)
router.post('/students', requireRole('instructor'), classController.addStudentToClass);

// Remove student from class (instructor only)
router.delete(
  '/:classId/students/:studentId',
  requireRole('instructor'),
  classController.removeStudentFromClass
);

export default router;
