/**
 * Analytics Controller
 * Handles exam statistics, question analytics, and student performance
 */

import type { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, asyncHandler } from '../middleware/errorHandler.js';

/**
 * Get exam statistics
 * GET /api/exams/:examId/statistics
 */
export const getExamStatistics = asyncHandler(async (req: Request, res: Response) => {
  const { examId } = req.params;

  // Get all attempts for this exam
  const { data: attempts, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('*')
    .eq('exam_id', examId)
    .eq('status', 'completed');

  if (error) {
    throw new ApiError('Failed to fetch exam attempts', 500);
  }

  if (!attempts || attempts.length === 0) {
    res.json({
      success: true,
      data: {
        examId,
        totalAttempts: 0,
        averageScore: 0,
        completionRate: 0,
        averageTime: 0,
        scoreDistribution: {}
      }
    });
  }

  // Calculate statistics
  const totalAttempts = attempts.length;
  const scores = attempts.map(a => a.score || 0);
  const averageScore = scores.reduce((a, b) => a + b, 0) / totalAttempts;

  // Calculate average time (in minutes)
  const times = attempts
    .filter(a => a.started_at && a.completed_at)
    .map(a => {
      const start = new Date(a.started_at).getTime();
      const end = new Date(a.completed_at!).getTime();
      return (end - start) / (1000 * 60); // Convert to minutes
    });
  
  const averageTime = times.length > 0 
    ? times.reduce((a, b) => a + b, 0) / times.length 
    : 0;

  // Score distribution (group by ranges: 0-20, 21-40, 41-60, 61-80, 81-100)
  const scoreDistribution: Record<string, number> = {
    '0-20': 0,
    '21-40': 0,
    '41-60': 0,
    '61-80': 0,
    '81-100': 0
  };

  scores.forEach(score => {
    if (score <= 20) scoreDistribution['0-20']++;
    else if (score <= 40) scoreDistribution['21-40']++;
    else if (score <= 60) scoreDistribution['41-60']++;
    else if (score <= 80) scoreDistribution['61-80']++;
    else scoreDistribution['81-100']++;
  });

  // Get total assigned students for completion rate
  const { data: assignments } = await supabaseAdmin
    .from('exam_assignments')
    .select('class_id')
    .eq('exam_id', examId);

  let totalStudents = 0;
  if (assignments && assignments.length > 0) {
    for (const assignment of assignments) {
      const { count } = await supabaseAdmin
        .from('class_students')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', assignment.class_id);
      
      totalStudents += count || 0;
    }
  }

  const completionRate = totalStudents > 0 
    ? (totalAttempts / totalStudents) * 100 
    : 100;

  res.json({
    success: true,
    data: {
      examId,
      totalAttempts,
      averageScore: Math.round(averageScore * 100) / 100,
      completionRate: Math.round(completionRate * 100) / 100,
      averageTime: Math.round(averageTime * 100) / 100,
      scoreDistribution
    }
  });
});

/**
 * Get question analytics for an exam
 * GET /api/exams/:examId/analytics/questions
 */
export const getQuestionAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const { examId } = req.params;

  // Get exam to get question IDs
  const { data: exam, error: examError } = await supabaseAdmin
    .from('exams')
    .select('question_ids')
    .eq('id', examId)
    .single();

  if (examError || !exam) {
    throw new ApiError('Exam not found', 404);
  }

  // Get all attempts for this exam
  const { data: attempts, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('responses')
    .eq('exam_id', examId)
    .eq('status', 'completed');

  if (error) {
    throw new ApiError('Failed to fetch exam attempts', 500);
  }

  // Analyze each question
  const questionAnalytics: Record<string, any> = {};
  
  exam.question_ids.forEach((questionId: string) => {
    questionAnalytics[questionId] = {
      questionId,
      attempts: 0,
      correctCount: 0,
      incorrectCount: 0,
      totalTimeSeconds: 0,
      averageTimeSeconds: 0
    };
  });

  // Process all responses
  attempts?.forEach(attempt => {
    attempt.responses.forEach((response: any) => {
      const questionId = response.question_id;
      if (questionAnalytics[questionId]) {
        questionAnalytics[questionId].attempts++;
        
        if (response.is_correct === true) {
          questionAnalytics[questionId].correctCount++;
        } else if (response.is_correct === false) {
          questionAnalytics[questionId].incorrectCount++;
        }

        if (response.time_spent_seconds) {
          questionAnalytics[questionId].totalTimeSeconds += response.time_spent_seconds;
        }
      }
    });
  });

  // Calculate averages
  Object.values(questionAnalytics).forEach((analytics: any) => {
    if (analytics.attempts > 0) {
      analytics.averageTimeSeconds = Math.round(
        (analytics.totalTimeSeconds / analytics.attempts) * 100
      ) / 100;
      
      // Calculate difficulty index (percentage correct)
      analytics.difficultyIndex = analytics.attempts > 0
        ? Math.round((analytics.correctCount / analytics.attempts) * 100)
        : 0;
    }
    delete analytics.totalTimeSeconds; // Remove intermediate calculation
  });

  res.json({
    success: true,
    data: Object.values(questionAnalytics)
  });
});

/**
 * Get student performance
 * GET /api/students/:studentId/performance
 */
export const getStudentPerformance = asyncHandler(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  const { timeRange } = req.query;

  // Build date filter
  let dateFilter: Date | undefined;
  if (timeRange === 'week') {
    dateFilter = new Date();
    dateFilter.setDate(dateFilter.getDate() - 7);
  } else if (timeRange === 'month') {
    dateFilter = new Date();
    dateFilter.setMonth(dateFilter.getMonth() - 1);
  } else if (timeRange === 'year') {
    dateFilter = new Date();
    dateFilter.setFullYear(dateFilter.getFullYear() - 1);
  }

  // Get student's attempts
  let query = supabaseAdmin
    .from('exam_attempts')
    .select('*, exams(title)')
    .eq('student_id', studentId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  if (dateFilter) {
    query = query.gte('completed_at', dateFilter.toISOString());
  }

  const { data: attempts, error } = await query;

  if (error) {
    throw new ApiError('Failed to fetch student attempts', 500);
  }

  if (!attempts || attempts.length === 0) {
    res.json({
      success: true,
      data: {
        studentId,
        totalExams: 0,
        averageScore: 0,
        timeRange,
        recentAttempts: []
      }
    });
  }

  // Calculate performance metrics
  const totalExams = attempts.length;
  const scores = attempts.map(a => a.score || 0);
  const averageScore = scores.reduce((a, b) => a + b, 0) / totalExams;
  
  // Get highest and lowest scores
  const highestScore = Math.max(...scores);
  const lowestScore = Math.min(...scores);

  // Calculate improvement trend (compare first half vs second half)
  const midpoint = Math.floor(attempts.length / 2);
  const recentScores = scores.slice(0, midpoint);
  const olderScores = scores.slice(midpoint);
  
  const recentAvg = recentScores.length > 0 
    ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length 
    : 0;
  const olderAvg = olderScores.length > 0 
    ? olderScores.reduce((a, b) => a + b, 0) / olderScores.length 
    : 0;
  
  const improvementTrend = recentAvg - olderAvg;

  // Format recent attempts
  const recentAttempts = attempts.slice(0, 10).map(attempt => ({
    examId: attempt.exam_id,
    examTitle: attempt.exams?.title || 'Unknown',
    score: attempt.score,
    completedAt: attempt.completed_at,
    flagged: attempt.flagged
  }));

  res.json({
    success: true,
    data: {
      studentId,
      totalExams,
      averageScore: Math.round(averageScore * 100) / 100,
      highestScore,
      lowestScore,
      improvementTrend: Math.round(improvementTrend * 100) / 100,
      timeRange: timeRange || 'all',
      recentAttempts
    }
  });
});

/**
 * Get active exam sessions
 * GET /api/exams/:examId/sessions/active
 */
export const getActiveSessions = asyncHandler(async (req: Request, res: Response) => {
  const { examId } = req.params;

  // Get in-progress attempts
  const { data: attempts, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('*, users(id, name, email)')
    .eq('exam_id', examId)
    .eq('status', 'in_progress');

  if (error) {
    throw new ApiError('Failed to fetch active sessions', 500);
  }

  const sessions = attempts?.map(attempt => ({
    attemptId: attempt.id,
    studentId: attempt.student_id,
    studentName: attempt.users?.name || 'Unknown',
    startedAt: attempt.started_at,
    progress: attempt.responses?.length || 0,
    warningCount: attempt.anti_cheat_warnings?.length || 0,
    flagged: attempt.flagged
  })) || [];

  res.json({
    success: true,
    data: sessions
  });
});

/**
 * Get flagged exam attempts
 * GET /api/exams/:examId/attempts/flagged
 */
export const getFlaggedAttempts = asyncHandler(async (req: Request, res: Response) => {
  const { examId } = req.params;

  // Get flagged attempts
  const { data: attempts, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('*, users(id, name, email)')
    .eq('exam_id', examId)
    .eq('flagged', true);

  if (error) {
    throw new ApiError('Failed to fetch flagged attempts', 500);
  }

  const flaggedAttempts = attempts?.map(attempt => ({
    attemptId: attempt.id,
    studentId: attempt.student_id,
    studentName: attempt.users?.name || 'Unknown',
    startedAt: attempt.started_at,
    completedAt: attempt.completed_at,
    status: attempt.status,
    score: attempt.score,
    warningCount: attempt.anti_cheat_warnings?.length || 0,
    warnings: attempt.anti_cheat_warnings || []
  })) || [];

  res.json({
    success: true,
    data: flaggedAttempts
  });
});
