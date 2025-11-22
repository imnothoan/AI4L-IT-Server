import type { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, asyncHandler } from '../middleware/errorHandler.js';
import { catService } from '../services/catService.js';
import { geminiService } from '../services/geminiService.js';
import type { QuestionResponse, AntiCheatWarning, CATState } from '../types/index.js';

/**
 * Start a new exam attempt
 */
export const startExamAttempt = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'student') {
    throw new ApiError('Only students can start exam attempts', 403);
  }

  const { examId } = req.body;

  // Get exam details
  const { data: exam, error: examError } = await supabaseAdmin
    .from('exams')
    .select('*')
    .eq('id', examId)
    .single();

  if (examError || !exam) {
    throw new ApiError('Exam not found', 404);
  }

  // Check if student already has an active attempt
  const { data: existingAttempt } = await supabaseAdmin
    .from('exam_attempts')
    .select('id')
    .eq('exam_id', examId)
    .eq('student_id', req.user.id)
    .eq('status', 'in_progress')
    .single();

  if (existingAttempt) {
    throw new ApiError('You already have an active attempt for this exam', 409);
  }

  // Initialize CAT state if CAT is enabled
  let catState: CATState | undefined;
  if (exam.enable_cat) {
    catState = catService.initializeState(exam.cat_settings);
  }

  // Create exam attempt
  const { data: attempt, error } = await supabaseAdmin
    .from('exam_attempts')
    .insert({
      exam_id: examId,
      student_id: req.user.id,
      status: 'in_progress',
      responses: [],
      anti_cheat_warnings: [],
      flagged: false,
      cat_state: catState
    })
    .select()
    .single();

  if (error || !attempt) {
    console.error('Error creating exam attempt:', error);
    throw new ApiError('Failed to start exam attempt', 500);
  }

  res.status(201).json({
    success: true,
    data: attempt
  });
});

/**
 * Get next question for CAT-enabled exam
 */
export const getNextQuestion = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'student') {
    throw new ApiError('Only students can get questions', 403);
  }

  const { attemptId } = req.params;

  // Get attempt with exam details
  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('exam_attempts')
    .select('*, exams(*)')
    .eq('id', attemptId)
    .eq('student_id', req.user.id)
    .single();

  if (attemptError || !attempt) {
    throw new ApiError('Exam attempt not found', 404);
  }

  const exam = attempt.exams;

  if (exam.enable_cat) {
    // CAT mode: Select adaptive question
    const catState: CATState = attempt.cat_state || catService.initializeState();

    // Get available questions
    const answeredIds = attempt.responses.map((r: QuestionResponse) => r.question_id);
    
    const { data: availableQuestions } = await supabaseAdmin
      .from('questions')
      .select('*')
      .in('id', exam.question_ids)
      .not('id', 'in', `(${answeredIds.join(',')})`);

    if (!availableQuestions || availableQuestions.length === 0) {
      // No more questions available
      return res.json({
        success: true,
        data: null,
        message: 'No more questions available'
      });
    }

    // Select next question using CAT algorithm
    const nextQuestion = catService.selectNextQuestion(
      catState,
      availableQuestions,
      exam.cat_settings
    );

    if (!nextQuestion) {
      // CAT stopping criteria reached
      return res.json({
        success: true,
        data: null,
        message: 'CAT stopping criteria reached'
      });
    }

    return res.json({
      success: true,
      data: nextQuestion.question,
      reason: nextQuestion.reason
    });
  } else {
    // Traditional mode: Get next unanswered question
    const answeredIds = attempt.responses.map((r: QuestionResponse) => r.question_id);
    
    const { data: question } = await supabaseAdmin
      .from('questions')
      .select('*')
      .in('id', exam.question_ids)
      .not('id', 'in', answeredIds.length > 0 ? `(${answeredIds.join(',')})` : '()')
      .limit(1)
      .single();

    return res.json({
      success: true,
      data: question || null
    });
  }
});

/**
 * Submit answer to a question
 */
export const submitAnswer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'student') {
    throw new ApiError('Only students can submit answers', 403);
  }

  const { attemptId } = req.params;
  const { question_id, answer, time_spent_seconds }: QuestionResponse = req.body;

  // Get attempt
  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('exam_attempts')
    .select('*, exams(*)')
    .eq('id', attemptId)
    .eq('student_id', req.user.id)
    .single();

  if (attemptError || !attempt) {
    throw new ApiError('Exam attempt not found', 404);
  }

  if (attempt.status !== 'in_progress') {
    throw new ApiError('Exam attempt is not in progress', 400);
  }

  // Get question details
  const { data: question } = await supabaseAdmin
    .from('questions')
    .select('*')
    .eq('id', question_id)
    .single();

  if (!question) {
    throw new ApiError('Question not found', 404);
  }

  // Check if answer is correct (for multiple-choice)
  let isCorrect = false;
  if (question.type === 'multiple-choice') {
    isCorrect = String(answer) === String(question.correct_answer);
  }

  // Create response object
  const response: QuestionResponse = {
    question_id,
    answer,
    is_correct: question.type === 'multiple-choice' ? isCorrect : undefined,
    time_spent_seconds,
    answered_at: new Date().toISOString()
  };

  // Update responses
  const updatedResponses = [...attempt.responses, response];

  // Update CAT state if enabled
  let updatedCatState = attempt.cat_state;
  if (attempt.exams.enable_cat && question.type === 'multiple-choice') {
    updatedCatState = catService.updateAbility(
      attempt.cat_state || catService.initializeState(),
      question.difficulty,
      isCorrect
    );
  }

  // Update attempt
  const { data: updatedAttempt, error } = await supabaseAdmin
    .from('exam_attempts')
    .update({
      responses: updatedResponses,
      cat_state: updatedCatState,
      updated_at: new Date().toISOString()
    })
    .eq('id', attemptId)
    .select()
    .single();

  if (error || !updatedAttempt) {
    throw new ApiError('Failed to submit answer', 500);
  }

  res.json({
    success: true,
    data: {
      response,
      cat_state: updatedCatState
    }
  });
});

/**
 * Submit anti-cheat warning
 */
export const submitWarning = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'student') {
    throw new ApiError('Only students can submit warnings', 403);
  }

  const { attemptId } = req.params;
  const warningData: AntiCheatWarning = {
    ...req.body,
    timestamp: new Date().toISOString()
  };

  // Get attempt
  const { data: attempt } = await supabaseAdmin
    .from('exam_attempts')
    .select('anti_cheat_warnings, flagged')
    .eq('id', attemptId)
    .eq('student_id', req.user.id)
    .single();

  if (!attempt) {
    throw new ApiError('Exam attempt not found', 404);
  }

  const updatedWarnings = [...attempt.anti_cheat_warnings, warningData];
  
  // Auto-flag if too many warnings
  const highSeverityCount = updatedWarnings.filter(w => w.severity === 'high').length;
  const shouldFlag = attempt.flagged || highSeverityCount >= 3 || updatedWarnings.length >= 10;

  const { error } = await supabaseAdmin
    .from('exam_attempts')
    .update({
      anti_cheat_warnings: updatedWarnings,
      flagged: shouldFlag,
      updated_at: new Date().toISOString()
    })
    .eq('id', attemptId);

  if (error) {
    throw new ApiError('Failed to submit warning', 500);
  }

  res.json({
    success: true,
    data: {
      warning: warningData,
      flagged: shouldFlag
    }
  });
});

/**
 * Complete exam attempt
 */
export const completeExamAttempt = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'student') {
    throw new ApiError('Only students can complete exams', 403);
  }

  const { attemptId } = req.params;

  // Get attempt
  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('exam_attempts')
    .select('*, exams(*)')
    .eq('id', attemptId)
    .eq('student_id', req.user.id)
    .single();

  if (attemptError || !attempt) {
    throw new ApiError('Exam attempt not found', 404);
  }

  if (attempt.status !== 'in_progress') {
    throw new ApiError('Exam attempt is not in progress', 400);
  }

  // Calculate score
  let score = 0;
  let abilityEstimate: number | undefined;

  if (attempt.exams.enable_cat && attempt.cat_state) {
    // Use CAT ability estimate
    abilityEstimate = attempt.cat_state.ability_estimate;
    score = abilityEstimate !== undefined ? catService.calculateScore(abilityEstimate) : 0;
  } else {
    // Calculate traditional score
    const multipleChoiceResponses = attempt.responses.filter(
      (r: QuestionResponse) => r.is_correct !== undefined
    );
    const correctCount = multipleChoiceResponses.filter(
      (r: QuestionResponse) => r.is_correct
    ).length;
    score = Math.round((correctCount / multipleChoiceResponses.length) * 100) || 0;
  }

  // Grade essay questions if any
  const essayResponses = attempt.responses.filter(
    (r: QuestionResponse) => r.is_correct === undefined
  );

  if (essayResponses.length > 0 && geminiService.isAvailable()) {
    // TODO: Implement essay grading
    // For now, essays don't affect the score
  }

  // Update attempt as completed
  const { data: completedAttempt, error } = await supabaseAdmin
    .from('exam_attempts')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      score,
      ability_estimate: abilityEstimate,
      updated_at: new Date().toISOString()
    })
    .eq('id', attemptId)
    .select()
    .single();

  if (error || !completedAttempt) {
    throw new ApiError('Failed to complete exam attempt', 500);
  }

  res.json({
    success: true,
    data: completedAttempt
  });
});

/**
 * Get exam attempt details
 */
export const getExamAttempt = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('User not authenticated', 401);
  }

  const { id } = req.params;

  let query = supabaseAdmin
    .from('exam_attempts')
    .select('*, exams(*)')
    .eq('id', id);

  if (req.user.role === 'student') {
    query = query.eq('student_id', req.user.id);
  }

  const { data: attempt, error } = await query.single();

  if (error || !attempt) {
    throw new ApiError('Exam attempt not found', 404);
  }

  res.json({
    success: true,
    data: attempt
  });
});

/**
 * Get all exam attempts for an exam (instructor only)
 */
export const getExamAttempts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'instructor') {
    throw new ApiError('Only instructors can view all attempts', 403);
  }

  const { examId } = req.params;

  const { data: attempts, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('*, users(id, name, email)')
    .eq('exam_id', examId)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('Error fetching exam attempts:', error);
    throw new ApiError('Failed to fetch exam attempts', 500);
  }

  res.json({
    success: true,
    data: attempts || []
  });
});

/**
 * Get student's exam attempts
 */
export const getStudentAttempts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('User not authenticated', 401);
  }

  const studentId = req.user.role === 'student' ? req.user.id : req.params.studentId;

  const { data: attempts, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('*, exams(id, title)')
    .eq('student_id', studentId)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('Error fetching student attempts:', error);
    throw new ApiError('Failed to fetch student attempts', 500);
  }

  res.json({
    success: true,
    data: attempts || []
  });
});
