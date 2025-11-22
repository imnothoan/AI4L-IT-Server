// User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'instructor';
  created_at: string;
  updated_at: string;
}

export interface UserProfile extends User {
  avatar?: string;
  bio?: string;
}

// Class types
export interface Class {
  id: string;
  name: string;
  description?: string;
  instructor_id: string;
  created_at: string;
  updated_at: string;
}

export interface ClassStudent {
  class_id: string;
  student_id: string;
  joined_at: string;
}

// Question types
export interface Question {
  id: string;
  type: 'multiple-choice' | 'essay';
  question_text: string;
  options?: string[];
  correct_answer?: string | number;
  difficulty: number; // 0.0 - 1.0 for CAT algorithm
  topic?: string;
  explanation?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Exam types
export interface Exam {
  id: string;
  title: string;
  description?: string;
  instructor_id: string;
  duration_minutes: number;
  enable_cat: boolean;
  enable_anti_cheat: boolean;
  question_ids: string[];
  cat_settings?: CATSettings;
  scheduled_start?: string;
  scheduled_end?: string;
  created_at: string;
  updated_at: string;
}

export interface CATSettings {
  initial_ability: number;
  precision_threshold: number;
  min_questions: number;
  max_questions: number;
}

export interface ExamAssignment {
  exam_id: string;
  class_id: string;
  assigned_at: string;
}

// Exam Attempt types
export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  started_at: string;
  completed_at?: string;
  score?: number;
  ability_estimate?: number;
  responses: QuestionResponse[];
  anti_cheat_warnings: AntiCheatWarning[];
  flagged: boolean;
  status: 'in_progress' | 'completed' | 'abandoned';
}

export interface QuestionResponse {
  question_id: string;
  answer: string | number;
  is_correct?: boolean;
  time_spent_seconds: number;
  answered_at: string;
}

export interface AntiCheatWarning {
  timestamp: string;
  type: 'no_face' | 'multiple_faces' | 'looking_away' | 'tab_switch';
  severity: 'low' | 'medium' | 'high';
  details?: string;
}

// Analytics types
export interface ExamAnalytics {
  exam_id: string;
  total_attempts: number;
  average_score: number;
  completion_rate: number;
  average_time_minutes: number;
  score_distribution: Record<string, number>;
  question_analytics: QuestionAnalytics[];
}

export interface QuestionAnalytics {
  question_id: string;
  attempts: number;
  correct_count: number;
  incorrect_count: number;
  average_time_seconds: number;
  discrimination_index?: number;
}

// API Request/Response types
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role: 'student' | 'instructor';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  data?: {
    user: User;
    token: string;
    refreshToken: string;
    expiresIn: number;
  };
  error?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

// WebSocket types
export interface WebSocketMessage {
  type: 'monitoring' | 'warning' | 'progress' | 'heartbeat';
  payload: any;
}

export interface MonitoringSession {
  examId: string;
  studentId: string;
  startedAt: string;
  progress: number;
  currentQuestion: number;
  totalQuestions: number;
  warningCount: number;
}

// Gemini AI types
export interface QuestionGenerationRequest {
  topic: string;
  difficulty: number;
  count: number;
  type: 'multiple-choice' | 'essay';
  grade_level?: string; // 'elementary' | 'middle' | 'high' | 'university'
  subject?: string; // 'math' | 'literature' | 'science' | 'history' | 'english'
  language?: string; // 'vi' | 'en'
}

export interface EssayGradingRequest {
  question: string;
  answer: string;
  rubric?: string;
  max_score: number;
}

export interface EssayGradingResult {
  score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  breakdown?: Record<string, number>;
}

// CAT Algorithm types
export interface CATState {
  ability_estimate: number;
  standard_error: number;
  questions_administered: number;
  responses: {
    question_id: string;
    difficulty: number;
    is_correct: boolean;
  }[];
}

export interface CATNextQuestion {
  question: Question;
  reason: string;
}

// Utility types
export type UserRole = 'student' | 'instructor';
export type ExamStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'archived';
export type QuestionType = 'multiple-choice' | 'essay';
export type WarningSeverity = 'low' | 'medium' | 'high';
export type WarningType = 'no_face' | 'multiple_faces' | 'looking_away' | 'tab_switch';

// Environment variables type
export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  API_PREFIX: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  GEMINI_API_KEY: string;
  CORS_ORIGIN: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  WS_PORT: number;
  LOG_LEVEL: string;
}
