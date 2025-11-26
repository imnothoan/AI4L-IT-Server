import { Router } from 'express';
import { supabase } from '../config/supabase';
import { authMiddleware as authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * Store violation from proctoring system
 * POST /api/anticheat/violations
 */
router.post('/violations', authenticateToken, async (req, res) => {
    try {
        const { attemptId, type, severity, message, metadata } = req.body;

        if (!attemptId || !type) {
            return res.status(400).json({ error: 'attemptId and type are required' });
        }

        // Insert violation into database
        const { data, error } = await supabase
            .from('anticheat_violations')
            .insert({
                attempt_id: attemptId,
                type,
                severity: severity || 'medium',
                message,
                metadata: metadata || {},
                detected_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // Check if should lock exam (3+ violations)
        const { data: violationCount } = await supabase
            .from('anticheat_violations')
            .select('id', { count: 'exact' })
            .eq('attempt_id', attemptId);

        const shouldLock = (violationCount?.length || 0) >= 3;

        if (shouldLock) {
            // Lock the exam attempt
            await supabase
                .from('exam_attempts')
                .update({
                    status: 'locked',
                    locked_reason: 'Multiple anti-cheat violations detected',
                    updated_at: new Date().toISOString()
                })
                .eq('id', attemptId);
        }

        res.status(201).json({
            success: true,
            violation: data,
            shouldLock,
            totalViolations: violationCount?.length || 0
        });
    } catch (error: any) {
        console.error('Store violation error:', error);
        res.status(500).json({ error: 'Failed to store violation', details: error.message });
    }
});

/**
 * Get violations for an attempt
 * GET /api/anticheat/violations/:attemptId
 */
router.get('/violations/:attemptId', authenticateToken, async (req, res) => {
    try {
        const { attemptId } = req.params;

        const { data, error } = await supabase
            .from('anticheat_violations')
            .select('*')
            .eq('attempt_id', attemptId)
            .order('detected_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            violations: data || [],
            count: data?.length || 0
        });
    } catch (error: any) {
        console.error('Get violations error:', error);
        res.status(500).json({ error: 'Failed to fetch violations', details: error.message });
    }
});

/**
 * Get violation summary for exam
 * GET /api/anticheat/exam/:examId/summary
 */
router.get('/exam/:examId/summary', authenticateToken, async (req, res) => {
    try {
        const { examId } = req.params;

        // Get all attempts for this exam
        const { data: attempts } = await supabase
            .from('exam_attempts')
            .select('id')
            .eq('exam_id', examId);

        if (!attempts || attempts.length === 0) {
            return res.json({
                success: true,
                summary: {
                    totalAttempts: 0,
                    violationCounts: {},
                    flaggedStudents: []
                }
            });
        }

        const attemptIds = attempts.map(a => a.id);

        // Get all violations for these attempts
        const { data: violations } = await supabase
            .from('anticheat_violations')
            .select('*')
            .in('attempt_id', attemptIds);

        // Aggregate by type
        const violationCounts: Record<string, number> = {};
        violations?.forEach(v => {
            violationCounts[v.type] = (violationCounts[v.type] || 0) + 1;
        });

        // Find students with 2+ violations
        const attemptViolations: Record<string, number> = {};
        violations?.forEach(v => {
            attemptViolations[v.attempt_id] = (attemptViolations[v.attempt_id] || 0) + 1;
        });

        const flaggedAttempts = Object.entries(attemptViolations)
            .filter(([_, count]) => count >= 2)
            .map(([attemptId, count]) => ({ attemptId, violationCount: count }));

        res.json({
            success: true,
            summary: {
                totalAttempts: attempts.length,
                totalViolations: violations?.length || 0,
                violationCounts,
                flaggedStudents: flaggedAttempts
            }
        });
    } catch (error: any) {
        console.error('Get exam summary error:', error);
        res.status(500).json({ error: 'Failed to fetch summary', details: error.message });
    }
});

/**
 * Export violation report as PDF (placeholder - future implementation)
 * GET /api/anticheat/violations/:attemptId/export
 */
router.get('/violations/:attemptId/export', authenticateToken, async (req, res) => {
    try {
        const { attemptId } = req.params;

        // TODO: Generate PDF report using library like pdfkit
        // For now, return JSON that can be used to generate PDF on frontend

        const { data: violations } = await supabase
            .from('anticheat_violations')
            .select('*')
            .eq('attempt_id', attemptId)
            .order('detected_at', { ascending: true });

        const { data: attempt } = await supabase
            .from('exam_attempts')
            .select(`
                *,
                exams(title),
                profiles(full_name, email)
            `)
            .eq('id', attemptId)
            .single();

        res.json({
            success: true,
            report: {
                attempt,
                violations: violations || [],
                generatedAt: new Date().toISOString()
            }
        });
    } catch (error: any) {
        console.error('Export report error:', error);
        res.status(500).json({ error: 'Failed to export report', details: error.message });
    }
});

export default router;
