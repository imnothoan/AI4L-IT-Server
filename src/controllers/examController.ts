import type { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, asyncHandler } from '../middleware/errorHandler.js';
import type { Exam, PaginatedResponse } from '../types/index.js';

export const createExam = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'instructor') {
    throw new ApiError('Only instructors can create exams', 403);
  }

  const examData = {
    ...req.body,
    instructor_id: req.user.id
  };

  const { data: exam, error } = await supabaseAdmin
    .from('exams')
    .insert(examData)
    .select()
    .single();

  if (error || !exam) {
    console.error('Error creating exam:', error);
    throw new ApiError('Failed to create exam', 500);
  }

  res.status(201).json({
    success: true,
    data: exam
  });
});

export const getExams = asyncHandler(async (req: Request, res: Response<PaginatedResponse<Exam>>) => {
  if (!req.user) {
    throw new ApiError('User not authenticated', 401);
  }

  const page = parseInt(req.query.page as string) || 1;
  const perPage = parseInt(req.query.perPage as string) || 20;

  let query = supabaseAdmin
    .from('exams')
    .select('*', { count: 'exact' });

  if (req.user.role === 'instructor') {
    query = query.eq('instructor_id', req.user.id);
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  const { data: exams, error, count } = await query;

  if (error) {
    console.error('Error fetching exams:', error);
    throw new ApiError('Failed to fetch exams', 500);
  }

  res.json({
    success: true,
    data: exams || [],
    pagination: {
      page,
      perPage,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / perPage)
    }
  });
});

export const getExam = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: exam, error } = await supabaseAdmin
    .from('exams')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !exam) {
    throw new ApiError('Exam not found', 404);
  }

  res.json({
    success: true,
    data: exam
  });
});

export const updateExam = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'instructor') {
    throw new ApiError('Only instructors can update exams', 403);
  }

  const { id } = req.params;

  const { data: existing } = await supabaseAdmin
    .from('exams')
    .select('instructor_id')
    .eq('id', id)
    .single();

  if (!existing || existing.instructor_id !== req.user.id) {
    throw new ApiError('Exam not found or insufficient permissions', 404);
  }

  const updates = {
    ...req.body,
    updated_at: new Date().toISOString()
  };

  const { data: exam, error } = await supabaseAdmin
    .from('exams')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !exam) {
    throw new ApiError('Failed to update exam', 500);
  }

  res.json({
    success: true,
    data: exam
  });
});

export const deleteExam = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'instructor') {
    throw new ApiError('Only instructors can delete exams', 403);
  }

  const { id } = req.params;

  const { data: existing } = await supabaseAdmin
    .from('exams')
    .select('instructor_id')
    .eq('id', id)
    .single();

  if (!existing || existing.instructor_id !== req.user.id) {
    throw new ApiError('Exam not found or insufficient permissions', 404);
  }

  const { error } = await supabaseAdmin
    .from('exams')
    .delete()
    .eq('id', id);

  if (error) {
    throw new ApiError('Failed to delete exam', 500);
  }

  res.json({
    success: true,
    message: 'Exam deleted successfully'
  });
});

export const assignExamToClass = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'instructor') {
    throw new ApiError('Only instructors can assign exams', 403);
  }

  const { examId, classId } = req.body;

  const { data, error } = await supabaseAdmin
    .from('exam_assignments')
    .insert({
      exam_id: examId,
      class_id: classId
    })
    .select()
    .single();

  if (error) {
    throw new ApiError('Failed to assign exam', 500);
  }

  res.status(201).json({
    success: true,
    data
  });
});
