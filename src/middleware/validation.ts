import Joi from 'joi';
import type { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler.js';

// Generic validation middleware factory
export const validate = (schema: Joi.ObjectSchema, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      throw new ApiError(errorMessage, 400);
    }

    req[property] = value;
    next();
  };
};

// Validation schemas
export const schemas = {
  // Auth schemas
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(100).required(),
    role: Joi.string().valid('student', 'instructor').required()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  // Class schemas
  createClass: Joi.object({
    name: Joi.string().min(2).max(200).required(),
    description: Joi.string().max(1000).optional()
  }),

  updateClass: Joi.object({
    name: Joi.string().min(2).max(200).optional(),
    description: Joi.string().max(1000).optional()
  }),

  // Question schemas
  createQuestion: Joi.object({
    type: Joi.string().valid('multiple-choice', 'essay').required(),
    question_text: Joi.string().min(10).required(),
    options: Joi.array().items(Joi.string()).when('type', {
      is: 'multiple-choice',
      then: Joi.array().min(2).max(10).required(),
      otherwise: Joi.forbidden()
    }),
    correct_answer: Joi.alternatives().try(
      Joi.string(),
      Joi.number()
    ).when('type', {
      is: 'multiple-choice',
      then: Joi.required(),
      otherwise: Joi.forbidden()
    }),
    difficulty: Joi.number().min(0).max(1).required(),
    topic: Joi.string().max(100).optional(),
    explanation: Joi.string().max(1000).optional()
  }),

  // Exam schemas
  createExam: Joi.object({
    title: Joi.string().min(3).max(200).required(),
    description: Joi.string().max(1000).optional(),
    duration_minutes: Joi.number().min(1).max(480).required(),
    enable_cat: Joi.boolean().default(false),
    enable_anti_cheat: Joi.boolean().default(false),
    question_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
    cat_settings: Joi.object({
      initial_ability: Joi.number().default(0),
      precision_threshold: Joi.number().min(0).max(1).default(0.3),
      min_questions: Joi.number().min(1).default(5),
      max_questions: Joi.number().min(1).default(30)
    }).optional(),
    scheduled_start: Joi.date().iso().optional(),
    scheduled_end: Joi.date().iso().greater(Joi.ref('scheduled_start')).optional()
  }),

  // Exam attempt schemas
  submitAnswer: Joi.object({
    question_id: Joi.string().uuid().required(),
    answer: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    time_spent_seconds: Joi.number().min(0).required()
  }),

  submitWarning: Joi.object({
    type: Joi.string().valid('no_face', 'multiple_faces', 'looking_away', 'tab_switch').required(),
    severity: Joi.string().valid('low', 'medium', 'high').required(),
    details: Joi.string().max(500).optional()
  }),

  // Question generation schema
  generateQuestions: Joi.object({
    topic: Joi.string().min(2).max(200).required(),
    difficulty: Joi.number().min(0).max(1).required(),
    count: Joi.number().min(1).max(20).default(5),
    type: Joi.string().valid('multiple-choice', 'essay').required(),
    grade_level: Joi.string().valid('elementary', 'middle', 'high', 'university').optional(),
    subject: Joi.string().valid('math', 'literature', 'science', 'history', 'english').optional(),
    language: Joi.string().valid('vi', 'en').default('vi')
  }),

  // Essay grading schema
  gradeEssay: Joi.object({
    question: Joi.string().min(10).required(),
    answer: Joi.string().min(10).required(),
    rubric: Joi.string().max(1000).optional(),
    max_score: Joi.number().min(1).max(100).default(100)
  }),

  // Pagination schema
  pagination: Joi.object({
    page: Joi.number().min(1).default(1),
    perPage: Joi.number().min(1).max(100).default(20)
  })
};

export default validate;
