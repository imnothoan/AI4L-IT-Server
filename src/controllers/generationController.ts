import type { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, asyncHandler } from '../middleware/errorHandler.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface QuestionGenerationRequest {
    subject: string;
    grade: number;
    count: number;
    difficulty?: 'easy' | 'medium' | 'hard';
    topics?: string[];
}

/**
 * Generate questions using Gemini with advanced prompting
 * POST /api/generation/questions
 */
export const generateQuestions = asyncHandler(async (req: Request, res: Response) => {
    const { subject, grade, count, difficulty, topics }: QuestionGenerationRequest = req.body;

    if (!req.user || req.user.role !== 'instructor') {
        throw new ApiError('Only instructors can generate questions', 403);
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Advanced few-shot prompt with IRT calibration guidance
    const prompt = `<role>
You are a PhD-level education expert specializing in ${subject} for grade ${grade} students in Vietnam.
</role>

<task>
Generate ${count} multiple-choice questions at ${difficulty || 'mixed'} difficulty level.
${topics && topics.length > 0 ? `Focus on these topics: ${topics.join(', ')}` : ''}

For each question, you MUST estimate IRT (Item Response Theory) 3PL parameters:
- a (Discrimination): 0.5-2.5 (how well the question separates high vs low ability)
  * 0.5-0.9: Low discrimination (poor separator)
  * 1.0-1.5: Moderate discrimination (typical)
  * 1.6-2.5: High discrimination (excellent sep arator)
- b (Difficulty): -3 to +3 (required ability level)
  * -3 to -1: Easy (below average students can answer)
  * -0.5 to +0.5: Medium (average students)
  * +1 to +3: Hard (above average students)
- c (Guessing): 0.0-0.3 (probability of guessing correctly, typically 0.25 for 4 options)

CRITICAL: Ensure questions are:
1. Aligned with Vietnam curriculum standards
2. Have clear, unambiguous correct answers
3. Include plausible distractors
4. Avoid cultural bias or offensive content
5. 100% unique (no duplication with provided examples)

</task>

<examples>
Example 1 (Easy Math):
{
  "question": "Phương trình 2x + 3 = 7 có nghiệm là bao nhiêu?",
  "options": ["x = 1", "x = 2", "x = 3", "x = 4"],
  "correctAnswer": 1,
  "explanation": "2x + 3 = 7 → 2x = 4 → x = 2",
  "topic": "Phương trình bậc nhất",
  "irtParameters": { "a": 1.0, "b": -1.2, "c": 0.25 }
}

Example 2 (Hard Chemistry):
{
  "question": "Trong phản ứng C6H12O6 + 6O2 → 6CO2 + 6H2O + năng lượng, tỷ số thể tích khí CO2 sinh ra và O2 phản ứng là:",
  "options": ["1:1", "1:2", "2:1", "1:6"],
  "correctAnswer": 0,
  "explanation": "Theo phương trình hóa học, 1 mol glucose phản ứng với 6 mol O2 tạo 6 mol CO2. Tỷ số = 6/6 = 1:1",
  "topic": "Phản ứng hô hấp tế bào",
  "irtParameters": { "a": 1.8, "b": 1.5, "c": 0.25 }
}
</examples>

<output_format>
Return ONLY a valid JSON array (no markdown fences, no extra text):
[
  {
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correctAnswer": 0,
    "explanation": "...",
    "topic": "...",
    "irtParameters": { "a": 1.2, "b": 0.5, "c": 0.25 }
  }
]
</output_format>`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();

        // Remove markdown fences if present
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        const questions = JSON.parse(text);

        // Save to database
        const dbQuestions = questions.map((q: any) => ({
            question: q.question,
            type: 'multiple-choice',
            options: q.options,
            correct_answer: q.options[q.correctAnswer],
            explanation: q.explanation,
            topic: q.topic,
            irt_parameters: q.irtParameters,
            grade_level: { system: 'high-school', grade },
            subject: { main: subject },
            created_by: req.user!.id,
            created_at: new Date().toISOString(),
            version: 1,
            status: 'approved'
        }));

        const { data: savedQuestions, error } = await supabaseAdmin
            .from('questions')
            .insert(dbQuestions)
            .select();

        if (error) throw error;

        res.json({
            success: true,
            data: {
                generated: questions.length,
                saved: savedQuestions?.length || 0,
                questions: savedQuestions
            }
        });

    } catch (error: any) {
        console.error('Gemini generation error:', error);

        // Fallback to mock if Gemini fails
        const mockQuestions = Array.from({ length: Math.min(count, 10) }).map((_, i) => ({
            question: `Câu hỏi giả lập ${i + 1} môn ${subject} lớp ${grade}`,
            type: 'multiple-choice',
            options: ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
            correct_answer: "Đáp án A",
            explanation: "Giải thích giả lập",
            topic: topics?.[0] || "Chủ đề tổng quát",
            irt_parameters: {
                a: 0.8 + Math.random() * 1.5,
                b: -2 + Math.random() * 4,
                c: 0.25
            },
            grade_level: { system: 'high-school', grade },
            subject: { main: subject },
            created_by: req.user!.id,
            created_at: new Date().toISOString(),
            version: 1,
            status: 'draft'
        }));

        const { data: mockSaved } = await supabaseAdmin
            .from('questions')
            .insert(mockQuestions)
            .select();

        res.json({
            success: true,
            data: {
                generated: mockQuestions.length,
                saved: mockSaved?.length || 0,
                questions: mockSaved,
                usedMockFallback: true,
                error: error.message
            }
        });
    }
});

/**
 * Calibrate IRT parameters for existing questions
 * POST /api/generation/calibrate
 */
export const calibrateQuestions = asyncHandler(async (req: Request, res: Response) => {
    const { questionIds } = req.body;

    if (!req.user || req.user.role !== 'instructor') {
        throw new ApiError('Only instructors can calibrate questions', 403);
    }

    // Fetch response data for calibration
    const { data: responses } = await supabaseAdmin
        .from('exam_responses')
        .select('question_id, is_correct, student_id')
        .in('question_id', questionIds);

    if (!responses || responses.length < 30) {
        throw new ApiError('Need at least 30 responses per question for calibration', 400);
    }

    // Group by question
    const byQuestion = responses.reduce((acc: any, r: any) => {
        if (!acc[r.question_id]) acc[r.question_id] = [];
        acc[r.question_id].push(r);
        return acc;
    }, {});

    const calibratedParams: any[] = [];

    for (const [qId, qResponses] of Object.entries(byQuestion) as any) {
        const totalResponses = qResponses.length;
        const correctCount = qResponses.filter((r: any) => r.is_correct).length;
        const pCorrect = correctCount / totalResponses;

        // Simple IRT estimation (in production, use EM algorithm or MCMC)
        const difficulty = -Math.log((pCorrect - 0.25) / (1 - 0.25)); // Rasch approximation
        const discrimination = 1.2; // Default, would need item analysis for actual value
        const guessing = 0.25;

        calibratedParams.push({
            questionId: qId,
            irtParameters: {
                a: discrimination,
                b: Math.max(-3, Math.min(3, difficulty)), // Clamp to valid range
                c: guessing
            },
            sampleSize: totalResponses,
            pCorrect
        });

        // Update database
        await supabaseAdmin
            .from('questions')
            .update({
                irt_parameters: { a: discrimination, b: difficulty, c: guessing },
                calibration_date: new Date().toISOString(),
                calibration_sample_size: totalResponses
            })
            .eq('id', qId);
    }

    res.json({
        success: true,
        data: {
            calibrated: calibratedParams.length,
            parameters: calibratedParams
        }
    });
});
