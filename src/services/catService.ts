import { createClient } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';

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
     * TODO: Add Content Balancing (Shadow Test) and Exposure Control
     */
    async selectNextItem(session: TestSession): Promise<Item | null> {
        // 1. Fetch candidate items (not administered)
        // In a real app, we might fetch a subset or use a cached bank
        const { data: items, error } = await supabase
            .from('questions')
            .select('*')
            .not('id', 'in', `(${session.administered_items.join(',')})`) // Naive exclusion, optimize for large banks
            .limit(100); // Optimization: only fetch relevant difficulty range?

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
     * Prior: Normal(0, 1)
     * Posterior proportional to: Likelihood * Prior
     * We maximize: log(Likelihood) + log(Prior)
     */
    calculateTheta(administeredItems: Item[], responses: number[]): { theta: number, sem: number } {
        // Simple Newton-Raphson or bounded search could work. 
        // For robustness/simplicity here, we'll use a coarse grid search followed by a finer search 
        // (or just a simple optimization since TS stdlib is limited compared to SciPy).

        // Grid Search Implementation for stability
        let bestTheta = -3.0;
        let maxLogPosterior = -Infinity;

        const minTheta = -4.0;
        const maxTheta = 4.0;
        const step = 0.1;

        for (let t = minTheta; t <= maxTheta; t += step) {
            const logPrior = -0.5 * t * t; // log(e^(-t^2/2)) approx, ignoring constants
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

        // Calculate SEM (approximate using Information at bestTheta)
        // SEM = 1 / sqrt(Total Information + Prior Information)
        // Prior Information for N(0,1) is 1
        let totalInfo = 1.0;
        for (const item of administeredItems) {
            totalInfo += this.fisherInformation(bestTheta, item);
        }
        const sem = 1 / Math.sqrt(totalInfo);

        return { theta: bestTheta, sem };
    }
}

export const catService = new CatService();
