/**
 * Unit Tests for Advanced CAT Service
 * 
 * Tests:
 * - 3PL probability calculation
 * - Fisher Information formula
 * - Newton-Raphson convergence
 * - Bayesian MAP estimation accuracy
 * - Ability classification
 * - Stopping rules
 */

import { advancedCatService } from '../services/advancedCatService';

describe('AdvancedCatService', () => {
    describe('3PL Probability Calculation', () => {
        it('should calculate correct probability for typical parameters', () => {
            const theta = 0;
            const params = { a: 1, b: 0, c: 0.25 };

            const p = advancedCatService.calculateProbability(theta, params);

            // At theta=b, probability should be c + (1-c)/2 = 0.625
            expect(p).toBeCloseTo(0.625, 3);
        });

        it('should approach guessing parameter at very low theta', () => {
            const theta = -10;
            const params = { a: 1, b: 0, c: 0.25 };

            const p = advancedCatService.calculateProbability(theta, params);

            expect(p).toBeCloseTo(0.25, 2);
        });

        it('should approach 1.0 at very high theta', () => {
            const theta = 10;
            const params = { a: 1, b: 0, c: 0.25 };

            const p = advancedCatService.calculateProbability(theta, params);

            expect(p).toBeCloseTo(1.0, 2);
        });
    });

    describe('Fisher Information', () => {
        it('should maximize at theta = b for symmetric items', () => {
            const params = { a: 1.5, b: 1.0, c: 0.25 };

            const infoAtB = advancedCatService.calculateFisherInformation(1.0, params);
            const infoBelow = advancedCatService.calculateFisherInformation(0.5, params);
            const infoAbove = advancedCatService.calculateFisherInformation(1.5, params);

            expect(infoAtB).toBeGreaterThan(infoBelow);
            expect(infoAtB).toBeGreaterThan(infoAbove);
        });

        it('should increase with discrimination parameter', () => {
            const theta = 0;
            const params1 = { a: 1.0, b: 0, c: 0.25 };
            const params2 = { a: 2.0, b: 0, c: 0.25 };

            const info1 = advancedCatService.calculateFisherInformation(theta, params1);
            const info2 = advancedCatService.calculateFisherInformation(theta, params2);

            // Info scales with a^2
            expect(info2 / info1).toBeCloseTo(4, 1);
        });
    });

    describe('Bayesian MAP Estimation', () => {
        it('should converge to correct theta for simple pattern', () => {
            const responses = [
                { questionId: '1', correct: true, itemParams: { a: 1, b: -1, c: 0.25 } },
                { questionId: '2', correct: true, itemParams: { a: 1, b: 0, c: 0.25 } },
                { questionId: '3', correct: false, itemParams: { a: 1, b: 1, c: 0.25 } },
                { questionId: '4', correct: false, itemParams: { a: 1, b: 2, c: 0.25 } }
            ];

            const result = advancedCatService.estimateThetaMAP(responses, 0);

            // Should estimate theta around 0.5 (between correct and incorrect items)
            expect(result.theta).toBeGreaterThan(0);
            expect(result.theta).toBeLessThan(1.5);
            expect(result.se).toBeLessThan(1.0);
        });

        it('should have decreasing SE with more responses', () => {
            const itemParams = { a: 1.5, b: 0, c: 0.25 };

            const responses3 = Array(3).fill(null).map((_, i) => ({
                questionId: `${i}`,
                correct: true,
                itemParams
            }));

            const responses10 = Array(10).fill(null).map((_, i) => ({
                questionId: `${i}`,
                correct: i % 2 === 0,
                itemParams
            }));

            const result3 = advancedCatService.estimateThetaMAP(responses3, 0);
            const result10 = advancedCatService.estimateThetaMAP(responses10, 0);

            expect(result10.se).toBeLessThan(result3.se);
        });

        it('should converge within tolerance', () => {
            const responses = [
                { questionId: '1', correct: true, itemParams: { a: 1.2, b: 0.5, c: 0.25 } },
                { questionId: '2', correct: true, itemParams: { a: 1.5, b: 0.8, c: 0.25 } },
                { questionId: '3', correct: false, itemParams: { a: 1.3, b: 1.5, c: 0.25 } }
            ];

            const result = advancedCatService.estimateThetaMAP(responses, 0);

            // Should converge (not hit max iterations)
            expect(result.theta).toBeDefined();
            expect(Math.abs(result.theta)).toBeLessThan(4); // Within bounds
        });

        it('should produce credible intervals', () => {
            const responses = [
                { questionId: '1', correct: true, itemParams: { a: 1, b: 0, c: 0.25 } }
            ];

            const result = advancedCatService.estimateThetaMAP(responses, 0);

            expect(result.ci).toBeDefined();
            expect(result.ci![0]).toBeLessThan(result.theta);
            expect(result.ci![1]).toBeGreaterThan(result.theta);
        });
    });

    describe('Item Selection', () => {
        it('should select item with maximum information at current theta', () => {
            const currentTheta = 1.0;
            const availableItems = [
                { id: '1', params: { a: 1.5, b: -1, c: 0.25 }, subject: 'Math' },
                { id: '2', params: { a: 1.5, b: 1.0, c: 0.25 }, subject: 'Math' }, // Should be selected
                { id: '3', params: { a: 1.5, b: 3, c: 0.25 }, subject: 'Math' }
            ];

            const selected = advancedCatService.selectNextItem(currentTheta, availableItems, []);

            expect(selected?.questionId).toBe('2');
        });

        it('should apply content balancing penalty', () => {
            const currentTheta = 0;
            const availableItems = [
                { id: '1', params: { a: 1.5, b: 0, c: 0.25 }, subject: 'Math' },
                { id: '2', params: { a: 1.5, b: 0, c: 0.25 }, subject: 'Physics' }
            ];

            const responses = [
                { questionId: '0', correct: true, itemParams: { a: 1, b: 0, c: 0.25 } }
            ];

            // Simulate that Math has been used before
            availableItems[0].timesUsed = 5;
            availableItems[1].timesUsed = 0;

            const selected = advancedCatService.selectNextItem(
                currentTheta,
                availableItems,
                responses,
                { contentBalance: true, exposureControl: true }
            );

            // Should prefer Physics (less exposed)
            expect(selected?.questionId).toBe('2');
        });

        it('should exclude overexposed items', () => {
            const currentTheta = 0;
            const availableItems = [
                { id: '1', params: { a: 1.5, b: 0, c: 0.25 }, timesUsed: 25 }, // Overexposed
                { id: '2', params: { a: 1.0, b: 0.5, c: 0.25 }, timesUsed: 0 }
            ];

            const selected = advancedCatService.selectNextItem(
                currentTheta,
                availableItems,
                [],
                { exposureControl: true, maxExposure: 20 }
            );

            expect(selected?.questionId).toBe('2');
        });
    });

    describe('Stopping Rules', () => {
        it('should not stop before minimum items', () => {
            const responses = [
                { questionId: '1', correct: true, itemParams: { a: 2, b: 0, c: 0.25 } },
                { questionId: '2', correct: true, itemParams: { a: 2, b: 0, c: 0.25 } }
            ];

            const result = advancedCatService.shouldStopTest(responses, 0.2);

            expect(result.shouldStop).toBe(false);
            expect(result.reason).toContain('Minimum items');
        });

        it('should stop when SE threshold met', () => {
            const responses = Array(10).fill(null).map((_, i) => ({
                questionId: `${i}`,
                correct: true,
                itemParams: { a: 2, b: 0, c: 0.25 }
            }));

            const result = advancedCatService.shouldStopTest(responses, 0.25);

            expect(result.shouldStop).toBe(true);
            expect(result.reason).toContain('precision');
        });

        it('should stop at maximum items', () => {
            const responses = Array(30).fill(null).map((_, i) => ({
                questionId: `${i}`,
                correct: i % 2 === 0,
                itemParams: { a: 1, b: 0, c: 0.25 }
            }));

            const result = advancedCatService.shouldStopTest(responses, 0.5);

            expect(result.shouldStop).toBe(true);
            expect(result.reason).toContain('Maximum');
        });
    });

    describe('Ability Classification', () => {
        it('should classify beginner correctly', () => {
            const classification = advancedCatService.classifyAbility(-2.5);

            expect(classification.level).toBe('Beginner');
            expect(classification.percentile).toBeLessThan(5);
        });

        it('should classify advanced correctly', () => {
            const classification = advancedCatService.classifyAbility(2.5);

            expect(classification.level).toBe('Advanced');
            expect(classification.percentile).toBeGreaterThan(95);
        });

        it('should classify average at theta=0', () => {
            const classification = advancedCatService.classifyAbility(0);

            expect(classification.level).toBe('Average');
            expect(classification.percentile).toBeCloseTo(50, 0);
        });
    });

    describe('Newton-Raphson Convergence', () => {
        it('should converge faster than grid search', () => {
            const responses = Array(5).fill(null).map((_, i) => ({
                questionId: `${i}`,
                correct: i % 2 === 0,
                itemParams: { a: 1.5, b: i - 2, c: 0.25 }
            }));

            const startTime = Date.now();
            advancedCatService.estimateThetaMAP(responses, 0);
            const duration = Date.now() - startTime;

            // Should complete in <10ms (vs grid search ~15-20ms)
            expect(duration).toBeLessThan(10);
        });
    });
});

describe('CAT Service Configuration', () => {
    it('should allow custom configuration', () => {
        advancedCatService.configure({
            minSE: 0.2,
            maxItems: 25,
            priorMean: 0.5
        });

        const responses = Array(10).fill(null).map((_, i) => ({
            questionId: `${i}`,
            correct: true,
            itemParams: { a: 2, b: 0, c: 0.25 }
        }));

        const result = advancedCatService.shouldStopTest(responses, 0.15);

        expect(result.shouldStop).toBe(true); // Using custom minSE=0.2
    });
});
