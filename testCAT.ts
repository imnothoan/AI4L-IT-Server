
import { apiClient } from './src/services/apiClient';
import { catService } from './src/services/catService';

async function testCAT() {
    console.log('🚀 Starting CAT Logic Test...');

    // Mock State
    const state = catService.initializeState();
    console.log('1. Initial State:', state);

    // Mock Questions
    const questions = [
        { id: 'q1', difficulty: -1.0, discrimination: 1.0, guessing: 0.25, topic: 'math' },
        { id: 'q2', difficulty: 0.0, discrimination: 1.0, guessing: 0.25, topic: 'math' },
        { id: 'q3', difficulty: 1.0, discrimination: 1.0, guessing: 0.25, topic: 'math' }
    ];

    // Select Next Question
    const next = await catService.selectNextQuestion(state, questions);
    console.log('2. Next Question:', next?.question.id, '(Expected q2 or similar)');

    // Update Ability (Correct Answer)
    const newState = catService.updateAbility(state, next?.question.difficulty || 0, true);
    console.log('3. Updated State (Correct):', newState);

    // Select Next Question Again
    const next2 = await catService.selectNextQuestion(newState, questions);
    console.log('4. Next Question 2:', next2?.question.id, '(Expected harder q3)');

    // Update Ability (Incorrect Answer)
    const newState2 = catService.updateAbility(newState, next2?.question.difficulty || 0, false);
    console.log('5. Updated State (Incorrect):', newState2);

    console.log('✅ CAT Logic Test Completed');
}

testCAT().catch(console.error);
