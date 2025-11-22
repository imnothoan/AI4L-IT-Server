import type { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, asyncHandler } from '../middleware/errorHandler.js';
import type { Class, PaginatedResponse } from '../types/index.js';

export const createClass = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'instructor') {
    throw new ApiError('Only instructors can create classes', 403);
  }

  const classData = {
    ...req.body,
    instructor_id: req.user.id
  };

  const { data: classItem, error } = await supabaseAdmin
    .from('classes')
    .insert(classData)
    .select()
    .single();

  if (error || !classItem) {
    console.error('Error creating class:', error);
    throw new ApiError('Failed to create class', 500);
  }

  res.status(201).json({
    success: true,
    data: classItem
  });
});

export const getClasses = asyncHandler(async (req: Request, res: Response<PaginatedResponse<Class>>) => {
  if (!req.user) {
    throw new ApiError('User not authenticated', 401);
  }

  const page = parseInt(req.query.page as string) || 1;
  const perPage = parseInt(req.query.perPage as string) || 20;

  let query = supabaseAdmin
    .from('classes')
    .select('*', { count: 'exact' });

  if (req.user.role === 'instructor') {
    query = query.eq('instructor_id', req.user.id);
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  const { data: classes, error, count } = await query;

  if (error) {
    console.error('Error fetching classes:', error);
    throw new ApiError('Failed to fetch classes', 500);
  }

  res.json({
    success: true,
    data: classes || [],
    pagination: {
      page,
      perPage,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / perPage)
    }
  });
});

export const getClass = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: classItem, error } = await supabaseAdmin
    .from('classes')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !classItem) {
    throw new ApiError('Class not found', 404);
  }

  res.json({
    success: true,
    data: classItem
  });
});

export const updateClass = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'instructor') {
    throw new ApiError('Only instructors can update classes', 403);
  }

  const { id } = req.params;

  const { data: existing } = await supabaseAdmin
    .from('classes')
    .select('instructor_id')
    .eq('id', id)
    .single();

  if (!existing || existing.instructor_id !== req.user.id) {
    throw new ApiError('Class not found or insufficient permissions', 404);
  }

  const updates = {
    ...req.body,
    updated_at: new Date().toISOString()
  };

  const { data: classItem, error } = await supabaseAdmin
    .from('classes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !classItem) {
    throw new ApiError('Failed to update class', 500);
  }

  res.json({
    success: true,
    data: classItem
  });
});

export const deleteClass = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'instructor') {
    throw new ApiError('Only instructors can delete classes', 403);
  }

  const { id } = req.params;

  const { data: existing } = await supabaseAdmin
    .from('classes')
    .select('instructor_id')
    .eq('id', id)
    .single();

  if (!existing || existing.instructor_id !== req.user.id) {
    throw new ApiError('Class not found or insufficient permissions', 404);
  }

  const { error } = await supabaseAdmin
    .from('classes')
    .delete()
    .eq('id', id);

  if (error) {
    throw new ApiError('Failed to delete class', 500);
  }

  res.json({
    success: true,
    message: 'Class deleted successfully'
  });
});

export const addStudentToClass = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'instructor') {
    throw new ApiError('Only instructors can add students to classes', 403);
  }

  const { classId, studentId } = req.body;

  // Verify class ownership
  const { data: classItem } = await supabaseAdmin
    .from('classes')
    .select('instructor_id')
    .eq('id', classId)
    .single();

  if (!classItem || classItem.instructor_id !== req.user.id) {
    throw new ApiError('Class not found or insufficient permissions', 404);
  }

  // Check if student exists
  const { data: student } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', studentId)
    .single();

  if (!student || student.role !== 'student') {
    throw new ApiError('Student not found', 404);
  }

  // Add student to class
  const { data, error } = await supabaseAdmin
    .from('class_students')
    .insert({
      class_id: classId,
      student_id: studentId
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') { // Unique violation
      throw new ApiError('Student is already in this class', 409);
    }
    throw new ApiError('Failed to add student to class', 500);
  }

  res.status(201).json({
    success: true,
    data
  });
});

export const removeStudentFromClass = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'instructor') {
    throw new ApiError('Only instructors can remove students from classes', 403);
  }

  const { classId, studentId } = req.params;

  // Verify class ownership
  const { data: classItem } = await supabaseAdmin
    .from('classes')
    .select('instructor_id')
    .eq('id', classId)
    .single();

  if (!classItem || classItem.instructor_id !== req.user.id) {
    throw new ApiError('Class not found or insufficient permissions', 404);
  }

  const { error } = await supabaseAdmin
    .from('class_students')
    .delete()
    .eq('class_id', classId)
    .eq('student_id', studentId);

  if (error) {
    throw new ApiError('Failed to remove student from class', 500);
  }

  res.json({
    success: true,
    message: 'Student removed from class successfully'
  });
});

export const getClassStudents = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: students, error } = await supabaseAdmin
    .from('class_students')
    .select(`
      student_id,
      joined_at,
      users:student_id (
        id,
        email,
        name,
        avatar
      )
    `)
    .eq('class_id', id);

  if (error) {
    console.error('Error fetching class students:', error);
    throw new ApiError('Failed to fetch class students', 500);
  }

  res.json({
    success: true,
    data: students || []
  });
});

export const getClassExams = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: exams, error } = await supabaseAdmin
    .from('exam_assignments')
    .select(`
      exam_id,
      assigned_at,
      exams:exam_id (
        id,
        title,
        description,
        duration_minutes,
        enable_cat,
        enable_anti_cheat
      )
    `)
    .eq('class_id', id);

  if (error) {
    console.error('Error fetching class exams:', error);
    throw new ApiError('Failed to fetch class exams', 500);
  }

  res.json({
    success: true,
    data: exams || []
  });
});
