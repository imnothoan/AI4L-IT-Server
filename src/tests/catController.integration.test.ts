/**
 * Integration Tests for CAT Controller
 * 
 * Tests end-to-end CAT flow with database
 */

import request from 'supertest';
import app from '../app.js';
import { supabaseAdmin } from '../config/supabase.js';

describe('CAT Controller Integration', () => {
    let examId: string;
    let studentId: string;
    let attemptId: string;

    beforeAll(async () => {
        // Create test student
        const { data: student } = await supabaseAdmin
            .from('profiles')
            .insert({ email: 'test-cat@example.com', full_name: 'CAT Test Student' })
            .select()
            .single();
        studentId = student.id;

        // Create test exam
        const { data: exam } = await supabaseAdmin
            .from('exams')
            .insert({
                title: 'CAT Integration Test',
                type: 'adaptive',
                status: 'published'
            })
            .select()
            .single();
        examId = exam.id;

        // Create test questions with IRT parameters
        await supabaseAdmin.from('questions').insert([
            {
                question: 'Easy question',
                type: 'multiple-choice',
                options: ['A', 'B', 'C', 'D'],
                correct_answer: 'A',
                irt_parameters: { a: 1.0, b: -1.0, c: 0.25 },
                topic: 'Math'
            },
            {
                question: 'Medium question',
                type: 'multiple-choice',
                options: ['A', 'B', 'C', 'D'],
                correct_answer: 'B',
                irt_parameters: { a: 1.5, b: 0.0, c: 0.25 },
                topic: 'Math'
            },
            {
                question: 'Hard question',
                type: 'multiple-choice',
                options: ['A', 'B', 'C', 'D'],
                correct_answer: 'C',
                irt_parameters: { a: 1.8, b: 1.5, c: 0.25 },
                topic: 'Math'
            }
        ]);
    });

    afterAll(async () => {
        // Cleanup
        if (attemptId) {
            await supabaseAdmin.from('exam_attempts').delete().eq('id', attemptId);
        }
        await supabaseAdmin.from('questions').delete().ilike('question', '%test%');
        await supabaseAdmin.from('exams').delete().eq('id', examId);
        await supabaseAdmin.from('profiles').delete().eq('id', studentId);
    });

    describe('POST /api/cat/start', () => {
        it('should start a CAT session', async () => {
            const response = await request(app)
                .post('/api/cat/start')
                .send({ examId })
                .set('Authorization', `Bearer ${studentId}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.attemptId).toBeDefined();
            expect(response.body.data.nextQuestion).toBeDefined();

            attemptId = response.body.data.attemptId;
        });
    });

    describe('POST /api/cat/next', () => {
        it('should adapt difficulty based on response', async () => {
            // Get first question
            const startResponse = await request(app)
                .post('/api/cat/start')
                .send({ examId })
                .set('Authorization', `Bearer ${studentId}`);

            attemptId = startResponse.body.data.attemptId;
            const firstQuestion = startResponse.body.data.nextQuestion;

            // Answer correctly
            const response = await request(app)
                .post('/api/cat/next')
                .send({
                    attemptId,
                    questionId: firstQuestion.id,
                    answer: firstQuestion.correctAnswer
                })
                .set('Authorization', `Bearer ${studentId}`);

            expect(response.status).toBe(200);
            expect(response.body.data.currentTheta).toBeGreaterThan(0);

            if (!response.body.data.completed) {
                const nextQuestion = response.body.data.nextQuestion;
                expect(nextQuestion.irtParameters.b).toBeGreaterThan(firstQuestion.irtParameters.b);
            }
        });

        it('should stop when SE threshold met', async () => {
            // Simulate multiple correct answers
            for (let i = 0; i < 15; i++) {
                const response = await request(app)
                    .post('/api/cat/next')
                    .send({
                        attemptId,
                        questionId: `q${i}`,
                        answer: 'correct'
                    })
                    .set('Authorization', `Bearer ${studentId}`);

                if (response.body.data.completed) {
                    expect(response.body.data.standardError).toBeLessThan(0.3);
                    expect(response.body.data.abilityLevel).toBeDefined();
                    expect(response.body.data.percentile).toBeDefined();
                    expect(response.body.data.credibleInterval).toBeDefined();
                    break;
                }
            }
        });
    });
});
