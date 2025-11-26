import { catService } from '../services/catService';
import { geminiService } from '../services/geminiService';

async function testCatEngine() {
    console.log('--- Testing CAT Engine Logic ---');

    // 1. Mock Items
    const items = [
        { id: '1', difficulty: -1.0, discrimination: 1.0, guessing: 0.2, content_area: 'Math' },
        { id: '2', difficulty: 0.0, discrimination: 1.2, guessing: 0.2, content_area: 'Math' },
        { id: '3', difficulty: 1.0, discrimination: 1.5, guessing: 0.2, content_area: 'Math' }
    ];

    // 2. Simulate correct answer to easy item
    console.log('Simulating response: Correct to Item 1 (Diff -1.0)');
    const result1 = catService.calculateTheta([items[0]], [1]);
    console.log(`Theta after 1 correct: ${result1.theta.toFixed(3)} (Expected > 0)`);

    // 3. Simulate correct answer to medium item
    console.log('Simulating response: Correct to Item 2 (Diff 0.0)');
    const result2 = catService.calculateTheta([items[0], items[1]], [1, 1]);
    console.log(`Theta after 2 correct: ${result2.theta.toFixed(3)} (Expected higher)`);

    // 4. Simulate incorrect answer to hard item
    console.log('Simulating response: Incorrect to Item 3 (Diff 1.0)');
    const result3 = catService.calculateTheta([items[0], items[1], items[2]], [1, 1, 0]);
    console.log(`Theta after 3 items (1,1,0): ${result3.theta.toFixed(3)} (Expected drop)`);
}

async function testGemini() {
    console.log('\n--- Testing Gemini Question Generation ---');
    try {
        const questions = await geminiService.generateQuestions('Linear Algebra', 1.5, 1);
        console.log('Generated Question:', JSON.stringify(questions[0], null, 2));

        if (questions.length > 0 && questions[0].content) {
            console.log('Gemini Test: PASSED');
        } else {
            console.log('Gemini Test: FAILED (No content)');
        }
    } catch (e) {
        console.error('Gemini Test Error:', e);
    }
}

async function run() {
    await testCatEngine();
    // await testGemini(); // Uncomment to test real API (costs quota/time)
}

run();
