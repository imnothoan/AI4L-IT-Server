import type { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, asyncHandler } from '../middleware/errorHandler.js';
import { geminiService } from '../services/geminiService.js';
import type { Question, QuestionGenerationRequest, PaginatedResponse } from '../types/index.js';

/**
 * Create a new question
 */
export const createQuestion = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('User not authenticated', 401);
  }

  const questionData = {
    ...req.body,
    created_by: req.user.id
  };

  const { data: question, error } = await supabaseAdmin
    .from('questions')
    .insert(questionData)
    .select()
    .single();

  if (error || !question) {
    console.error('Error creating question:', error);
    throw new ApiError('Failed to create question', 500);
  }

  res.status(201).json({
    success: true,
    data: question
  });
});

/**
 * Get all questions with pagination and filters
 */
export const getQuestions = asyncHandler(async (req: Request, res: Response<PaginatedResponse<Question>>) => {
  const page = parseInt(req.query.page as string) || 1;
  const perPage = parseInt(req.query.perPage as string) || 20;
  const topic = req.query.topic as string;
  const type = req.query.type as string;
  const difficulty_min = parseFloat(req.query.difficulty_min as string);
  const difficulty_max = parseFloat(req.query.difficulty_max as string);

  let query = supabaseAdmin
    .from('questions')
    .select('*', { count: 'exact' });

  // Apply filters
  if (topic) {
    query = query.ilike('topic', `%${topic}%`);
  }
  if (type) {
    query = query.eq('type', type);
  }
  if (!isNaN(difficulty_min)) {
    query = query.gte('difficulty', difficulty_min);
  }
  if (!isNaN(difficulty_max)) {
    query = query.lte('difficulty', difficulty_max);
  }

  // Apply pagination
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  const { data: questions, error, count } = await query;

  if (error) {
    console.error('Error fetching questions:', error);
    throw new ApiError('Failed to fetch questions', 500);
  }

  res.json({
    success: true,
    data: questions || [],
    pagination: {
      page,
      perPage,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / perPage)
    }
  });
});

/**
 * Get a single question by ID
 */
export const getQuestion = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: question, error } = await supabaseAdmin
    .from('questions')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !question) {
    throw new ApiError('Question not found', 404);
  }

  res.json({
    success: true,
    data: question
  });
});

/**
 * Update a question
 */
export const updateQuestion = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('User not authenticated', 401);
  }

  const { id } = req.params;

  // Check if question exists and user has permission
  const { data: existingQuestion } = await supabaseAdmin
    .from('questions')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!existingQuestion) {
    throw new ApiError('Question not found', 404);
  }

  if (existingQuestion.created_by !== req.user.id && req.user.role !== 'instructor') {
    throw new ApiError('Insufficient permissions', 403);
  }

  const updates = {
    ...req.body,
    updated_at: new Date().toISOString()
  };

  const { data: question, error } = await supabaseAdmin
    .from('questions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !question) {
    console.error('Error updating question:', error);
    throw new ApiError('Failed to update question', 500);
  }

  res.json({
    success: true,
    data: question
  });
});

/**
 * Delete a question
 */
export const deleteQuestion = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('User not authenticated', 401);
  }

  const { id } = req.params;

  // Check if question exists and user has permission
  const { data: existingQuestion } = await supabaseAdmin
    .from('questions')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!existingQuestion) {
    throw new ApiError('Question not found', 404);
  }

  if (existingQuestion.created_by !== req.user.id && req.user.role !== 'instructor') {
    throw new ApiError('Insufficient permissions', 403);
  }

  const { error } = await supabaseAdmin
    .from('questions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting question:', error);
    throw new ApiError('Failed to delete question', 500);
  }

  res.json({
    success: true,
    message: 'Question deleted successfully'
  });
});

/**
 * Generate questions using AI
 */
export const generateQuestions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('User not authenticated', 401);
  }

  if (req.user.role !== 'instructor') {
    throw new ApiError('Only instructors can generate questions', 403);
  }

  if (!geminiService.isAvailable()) {
    throw new ApiError('Gemini API is not configured. Please set GEMINI_API_KEY in environment variables.', 503);
  }

  const params: QuestionGenerationRequest = req.body;

  // Generate questions with Gemini
  const generatedQuestions = await geminiService.generateQuestions(params);

  // Save questions to database
  const questionsToInsert = generatedQuestions.map(q => ({
    ...q,
    created_by: req.user!.id
  }));

  const { data: questions, error } = await supabaseAdmin
    .from('questions')
    .insert(questionsToInsert)
    .select();

  if (error || !questions) {
    console.error('Error saving generated questions:', error);
    throw new ApiError('Failed to save generated questions', 500);
  }

  res.status(201).json({
    success: true,
    data: questions,
    message: `Successfully generated ${questions.length} questions`
  });
});

/**
 * Bulk import questions
 */
export const bulkImportQuestions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('User not authenticated', 401);
  }

  if (req.user.role !== 'instructor') {
    throw new ApiError('Only instructors can import questions', 403);
  }

  const { questions } = req.body;

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new ApiError('Invalid questions array', 400);
  }

  const questionsToInsert = questions.map(q => ({
    ...q,
    created_by: req.user!.id
  }));

  const { data: importedQuestions, error } = await supabaseAdmin
    .from('questions')
    .insert(questionsToInsert)
    .select();

  if (error || !importedQuestions) {
    console.error('Error importing questions:', error);
    throw new ApiError('Failed to import questions', 500);
  }

  res.status(201).json({
    success: true,
    data: importedQuestions,
    message: `Successfully imported ${importedQuestions.length} questions`
  });
});

/**
 * Get questions by IDs (for exam creation)
 */
export const getQuestionsByIds = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError('Invalid IDs array', 400);
  }

  const { data: questions, error } = await supabaseAdmin
    .from('questions')
    .select('*')
    .in('id', ids);

  if (error) {
    console.error('Error fetching questions:', error);
    throw new ApiError('Failed to fetch questions', 500);
  }

  res.json({
    success: true,
    data: questions || []
  });
});
