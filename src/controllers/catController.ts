import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { catService } from '../services/catService.js';
import { geminiService } from '../services/geminiService.js';

export class CatController {

    /**
     * Start a new CAT exam session
     * POST /api/cat/start
     */
    async startExam(req: Request, res: Response) {
        try {
            const { userId, examId } = req.body as any;

            // Initialize session in DB
            const { data: session, error } = await supabase
                .from('exam_attempts')
                .insert({
                    user_id: userId,
                    exam_id: examId,
                    current_theta: 0, // Start at average ability
                    status: 'in_progress',
                    started_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;

            // Get first item
            const nextItem = await catService.selectNextItem({
                id: session.id,
                user_id: userId,
                exam_id: examId,
                theta: 0,
                sem: 1,
                administered_items: []
            });

            res.json({ success: true, session, nextItem });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Submit answer and get next item
     * POST /api/cat/submit
     */
    async submitAnswer(req: Request, res: Response) {
        try {
            const { sessionId, itemId, answer, isCorrect } = req.body as any;

            // 1. Record response
            await supabase.from('exam_responses').insert({
                attempt_id: sessionId,
                question_id: itemId,
                selected_answer: answer,
                is_correct: isCorrect
            });

            // 2. Fetch all responses for this session to recalculate theta
            // (In production, optimize to incremental update if possible, but full recalc is safer)
            const { data: responses } = await supabase
                .from('exam_responses')
                .select('is_correct, questions(difficulty, discrimination, guessing)')
                .eq('attempt_id', sessionId);

            if (!responses) throw new Error('No responses found');

            const administeredItems = responses.map((r: any) => ({
                id: 'n/a', // Not needed for calc
                difficulty: r.questions.difficulty,
                discrimination: r.questions.discrimination,
                guessing: r.questions.guessing,
                content_area: ''
            }));

            const responseValues = responses.map((r: any) => r.is_correct ? 1 : 0);

            // 3. Recalculate Theta
            const { theta, sem } = catService.calculateTheta(administeredItems, responseValues);

            // 4. Update Session
            await supabase
                .from('exam_attempts')
                .update({ current_theta: theta, current_sem: sem })
                .eq('id', sessionId);

            // 5. Check stopping rule (e.g., SEM < 0.3 or max items reached)
            // For now, just select next item
            const administeredIds = responses.map((r: any) => r.question_id); // This needs actual IDs
            // Note: In step 2 we didn't fetch IDs properly for exclusion, fixing logic:
            const { data: previousItems } = await supabase
                .from('exam_responses')
                .select('question_id')
                .eq('attempt_id', sessionId);

            const prevIds = previousItems?.map(i => i.question_id) || [];

            const nextItem = await catService.selectNextItem({
                id: sessionId,
                user_id: 'n/a',
                exam_id: 'n/a',
                theta,
                sem,
                administered_items: prevIds
            });

            // If no item found in bank, try generating one with Gemini!
            let finalItem = nextItem;
            if (!finalItem) {
                console.log('Item bank exhausted. Generating new question with Gemini...');
                const generated = await geminiService.generateQuestions('General Math', theta, 1);
                if (generated && generated.length > 0) {
                    // Save generated question to DB
                    const q = generated[0];
                    const { data: newQ } = await supabase.from('questions').insert({
                        content: q.content,
                        options: q.options,
                        correct_answer: q.correct_answer,
                        difficulty: q.difficulty,
                        discrimination: q.discrimination,
                        guessing: q.guessing,
                        topic: q.topic
                    }).select().single();
                    finalItem = newQ;
                }
            }

            res.json({ success: true, theta, sem, nextItem: finalItem });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const catController = new CatController();
