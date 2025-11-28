import { createClient } from '@supabase/supabase-js';
import { supabase } from '../config/supabase.js';

// Types
interface Item {
    id: string;
    difficulty: number; // b
    discrimination: number; // a
    guessing: number; // c
    content_area: string;
}

interface TestSession {
    id: string;
    user_id: string;
    exam_id: string;
    theta: number; // Current ability estimate
    sem: number; // Standard Error of Measurement
    administered_items: string[]; // IDs of items already taken
}

export interface CATState {
    theta: number;
    sem: number;
    administered_items: string[];
    responses: any[];
    start_time: string;
    ability_estimate?: number;
}

export interface CATSettings {
    algorithm: 'mfi' | 'random';
    test_length: number;
}

export interface Question {
    id: string;
    difficulty?: number;
    discrimination?: number;
    guessing?: number;
    topic?: string;
    content?: string;
    irtParameters?: {
        difficultyIRT: number;
        discrimination: number;
        guessing: number;
    };
    [key: string]: any;
}

export class CatService {

    /**
     * 3-Parameter Logistic (3PL) Model
     * P(theta) = c + (1 - c) / (1 + e^(-a * (theta - b)))
     */
    private irf3pl(theta: number, a: number, b: number, c: number): number {
        const e = Math.exp(-a * (theta - b));
        return c + (1 - c) / (1 + e);
    }

    /**
     * Calculate Fisher Information for an item at a given theta
     * I(theta) = a^2 * (Q/P) * ((P-c)/(1-c))^2
     * where P = irf3pl(theta), Q = 1 - P
     */
    private fisherInformation(theta: number, item: Item): number {
        const P = this.irf3pl(theta, item.discrimination, item.difficulty, item.guessing);
        const Q = 1 - P;

        if (Q <= 0) return 0; // Avoid division by zero or invalid prob

        const numerator = Math.pow(item.discrimination, 2) * Q;
        const denominator = P;
        const term2 = Math.pow((P - item.guessing) / (1 - item.guessing), 2);

        return (numerator / denominator) * term2;
    }

    /**
     * Select next item using Maximum Fisher Information (MFI)
     */
    async selectNextItem(session: TestSession): Promise<Item | null> {
        // 1. Fetch candidate items (not administered)
        const { data: items, error } = await supabase
            .from('questions')
            .select('*')
            .not('id', 'in', `(${session.administered_items.join(',')})`)
            .limit(100);

        if (error || !items || items.length === 0) return null;

        let bestItem: Item | null = null;
        let maxInfo = -1;

        // 2. Find item with max info at current theta
        for (const rawItem of items) {
            const item: Item = {
                id: rawItem.id,
                difficulty: rawItem.difficulty || 0,
                discrimination: rawItem.discrimination || 1,
                guessing: rawItem.guessing || 0,
                content_area: rawItem.content_area
            };

            const info = this.fisherInformation(session.theta, item);
            if (info > maxInfo) {
                maxInfo = info;
                bestItem = item;
            }
        }

        return bestItem;
    }

    /**
     * Estimate Theta using Bayesian MAP (Maximum A Posteriori)
     */
    calculateTheta(administeredItems: Item[], responses: number[]): { theta: number, sem: number } {
        // Grid Search Implementation for stability
        let bestTheta = -3.0;
        let maxLogPosterior = -Infinity;

        const minTheta = -4.0;
        const maxTheta = 4.0;
        const step = 0.1;

        for (let t = minTheta; t <= maxTheta; t += step) {
            const logPrior = -0.5 * t * t; // log(e^(-t^2/2)) approx
            let logLikelihood = 0;

            for (let i = 0; i < administeredItems.length; i++) {
                const item = administeredItems[i];
                const resp = responses[i];
                let p = this.irf3pl(t, item.discrimination, item.difficulty, item.guessing);
                p = Math.max(0.0001, Math.min(0.9999, p)); // Clamp

                if (resp === 1) {
                    logLikelihood += Math.log(p);
                } else {
                    logLikelihood += Math.log(1 - p);
                }
            }

            const logPosterior = logPrior + logLikelihood;
            if (logPosterior > maxLogPosterior) {
                maxLogPosterior = logPosterior;
                bestTheta = t;
            }
        }

        // Calculate SEM
        let totalInfo = 1.0;
        for (const item of administeredItems) {
            totalInfo += this.fisherInformation(bestTheta, item);
        }
        const sem = 1 / Math.sqrt(totalInfo);

        return { theta: bestTheta, sem };
    }

    /**
     * Initialize CAT State
     */
    initializeState(_settings?: CATSettings): CATState {
        return {
            theta: 0,
            sem: 1,
            administered_items: [],
            responses: [],
            start_time: new Date().toISOString()
        };
    }

    /**
     * Select next question wrapper (Synchronous/Local version used by Controller)
     */
    selectNextQuestion(
        state: CATState,
        availableQuestions: Question[],
        _settings?: CATSettings
    ): { question: Question; reason: string } | null {

        let bestItem: Question | null = null;
        let maxInfo = -1;

        for (const q of availableQuestions) {
            const item: Item = {
                id: q.id,
                difficulty: q.difficulty || 0,
                discrimination: q.discrimination || 1,
                guessing: q.guessing || 0.25,
                content_area: q.topic || 'general'
            };

            // Use irtParameters if available
            if (q.irtParameters) {
                item.discrimination = q.irtParameters.discrimination;
                item.difficulty = q.irtParameters.difficultyIRT;
                item.guessing = q.irtParameters.guessing;
            }

            const info = this.fisherInformation(state.theta, item);
            if (info > maxInfo) {
                maxInfo = info;
                bestItem = q;
            }
        }

        if (bestItem) {
            return {
                question: bestItem,
                reason: `Maximum Fisher Information at theta ${state.theta.toFixed(2)}`
            };
        }

        return null;
    }

    /**
     * Update Ability (Theta)
     */
    updateAbility(state: CATState, itemDifficulty: number, isCorrect: boolean): CATState {
        const currentTheta = state.theta;
        const p = this.irf3pl(currentTheta, 1.0, itemDifficulty, 0.25);
        const score = isCorrect ? 1 : 0;

        // Simple update step
        const newTheta = currentTheta + 0.5 * (score - p);

        return {
            ...state,
            theta: Math.max(-4, Math.min(4, newTheta)),
            sem: state.sem * 0.95,
            ability_estimate: newTheta
        };
    }

    /**
     * Calculate Score (0-100) from Theta
     */
    calculateScore(theta: number): number {
        let score = ((theta + 3) / 6) * 100;
        return Math.round(Math.max(0, Math.min(100, score)));
    }
}

export const catService = new CatService();
