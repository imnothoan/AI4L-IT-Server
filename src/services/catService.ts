import type { Question, CATState, CATNextQuestion, CATSettings } from '../types/index.js';

/**
 * CAT (Computerized Adaptive Testing) Service
 * Implements Item Response Theory (IRT) 1PL model
 */
class CATService {
  /**
   * Initialize CAT state for a new exam attempt
   */
  initializeState(settings?: CATSettings): CATState {
    return {
      ability_estimate: settings?.initial_ability || 0,
      standard_error: 1.0,
      questions_administered: 0,
      responses: []
    };
  }

  /**
   * Update ability estimate based on response
   * Uses Maximum Likelihood Estimation (MLE)
   */
  updateAbility(state: CATState, questionDifficulty: number, isCorrect: boolean): CATState {
    const newState = { ...state };
    
    // Add response to history
    newState.responses.push({
      question_id: `q_${state.questions_administered}`,
      difficulty: questionDifficulty,
      is_correct: isCorrect
    });
    
    newState.questions_administered++;

    // Use MLE to estimate ability
    newState.ability_estimate = this.estimateAbilityMLE(newState.responses);
    
    // Calculate standard error
    newState.standard_error = this.calculateStandardError(newState.responses);

    return newState;
  }

  /**
   * Select next question using Maximum Information criterion
   */
  selectNextQuestion(
    state: CATState,
    availableQuestions: Question[],
    settings?: CATSettings
  ): CATNextQuestion | null {
    if (availableQuestions.length === 0) {
      return null;
    }

    // Check stopping criteria
    const minQuestions = settings?.min_questions || 5;
    const maxQuestions = settings?.max_questions || 30;
    const precisionThreshold = settings?.precision_threshold || 0.3;

    if (state.questions_administered >= maxQuestions) {
      return null; // Max questions reached
    }

    if (
      state.questions_administered >= minQuestions &&
      state.standard_error < precisionThreshold
    ) {
      return null; // Sufficient precision achieved
    }

    // Select question that maximizes information at current ability estimate
    let bestQuestion: Question | null = null;
    let maxInformation = -Infinity;

    for (const question of availableQuestions) {
      const information = this.calculateInformation(
        question.difficulty,
        state.ability_estimate
      );

      if (information > maxInformation) {
        maxInformation = information;
        bestQuestion = question;
      }
    }

    if (!bestQuestion) {
      return null;
    }

    return {
      question: bestQuestion,
      reason: `Selected question with difficulty ${bestQuestion.difficulty.toFixed(2)} ` +
              `to maximize information at ability ${state.ability_estimate.toFixed(2)}`
    };
  }

  /**
   * Calculate final score from ability estimate
   * Converts ability (-3 to +3) to score (0 to 100)
   */
  calculateScore(abilityEstimate: number): number {
    // Logistic transformation to 0-100 scale
    // ability of -3 -> ~5, 0 -> 50, +3 -> ~95
    const score = 100 / (1 + Math.exp(-1.7 * abilityEstimate));
    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Estimate ability using Maximum Likelihood Estimation
   * Uses Newton-Raphson method
   */
  private estimateAbilityMLE(
    responses: Array<{ difficulty: number; is_correct: boolean }>,
    maxIterations: number = 20,
    tolerance: number = 0.001
  ): number {
    if (responses.length === 0) {
      return 0;
    }

    let theta = 0; // Initial ability estimate

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let firstDerivative = 0;
      let secondDerivative = 0;

      for (const response of responses) {
        const p = this.probabilityCorrect(theta, response.difficulty);
        const u = response.is_correct ? 1 : 0;

        firstDerivative += u - p;
        secondDerivative -= p * (1 - p);
      }

      if (Math.abs(secondDerivative) < 1e-10) {
        break; // Avoid division by zero
      }

      const delta = firstDerivative / secondDerivative;
      theta -= delta;

      // Bound theta to reasonable range
      theta = Math.max(-3, Math.min(3, theta));

      if (Math.abs(delta) < tolerance) {
        break; // Converged
      }
    }

    return theta;
  }

  /**
   * Calculate standard error of ability estimate
   */
  private calculateStandardError(
    responses: Array<{ difficulty: number; is_correct: boolean }>
  ): number {
    if (responses.length === 0) {
      return 1.0;
    }

    // Fisher Information
    let information = 0;
    const theta = this.estimateAbilityMLE(responses);

    for (const response of responses) {
      information += this.calculateInformation(response.difficulty, theta);
    }

    if (information <= 0) {
      return 1.0;
    }

    // Standard error is 1 / sqrt(information)
    return 1 / Math.sqrt(information);
  }

  /**
   * Calculate Fisher Information for a question at given ability
   */
  private calculateInformation(difficulty: number, ability: number): number {
    const p = this.probabilityCorrect(ability, difficulty);
    return p * (1 - p);
  }

  /**
   * Calculate probability of correct response using 1PL IRT model
   * P(θ, b) = 1 / (1 + exp(-(θ - b)))
   * where θ is ability and b is difficulty
   */
  private probabilityCorrect(ability: number, difficulty: number): number {
    // Convert difficulty from 0-1 scale to IRT scale (-3 to +3)
    const b = this.convertDifficultyToIRT(difficulty);
    return 1 / (1 + Math.exp(-(ability - b)));
  }

  /**
   * Convert difficulty from 0-1 scale to IRT scale
   * 0.0 -> -3 (very easy)
   * 0.5 -> 0 (medium)
   * 1.0 -> +3 (very hard)
   */
  private convertDifficultyToIRT(difficulty: number): number {
    return (difficulty - 0.5) * 6;
  }

  /**
   * Analyze CAT performance
   */
  analyzePerformance(state: CATState): {
    efficiency: number;
    precision: number;
    abilityEstimate: number;
    score: number;
  } {
    const efficiency = state.responses.length > 0
      ? 1 / state.standard_error / state.responses.length
      : 0;

    return {
      efficiency,
      precision: 1 / state.standard_error,
      abilityEstimate: state.ability_estimate,
      score: this.calculateScore(state.ability_estimate)
    };
  }

  /**
   * Check if CAT should continue
   */
  shouldContinue(state: CATState, settings?: CATSettings): boolean {
    const minQuestions = settings?.min_questions || 5;
    const maxQuestions = settings?.max_questions || 30;
    const precisionThreshold = settings?.precision_threshold || 0.3;

    // Must administer at least minimum questions
    if (state.questions_administered < minQuestions) {
      return true;
    }

    // Stop if reached maximum questions
    if (state.questions_administered >= maxQuestions) {
      return false;
    }

    // Stop if achieved sufficient precision
    return state.standard_error >= precisionThreshold;
  }
}

export const catService = new CATService();
export default catService;
