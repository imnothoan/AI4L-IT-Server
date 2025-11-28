
import axios from 'axios';

const API_URL = 'http://localhost:3000/api';
let instructorToken = '';
let studentToken = '';
let examId = '';
let attemptId = '';

async function runSimulation() {
    console.log('🚀 Starting End-to-End Simulation...');

    try {
        // 1. Register Instructor
        console.log('1. Registering Instructor...');
        try {
            const res = await axios.post(`${API_URL}/auth/register`, {
                email: `instructor_${Date.now()}@test.com`,
                password: 'password123',
                name: 'Test Instructor',
                role: 'instructor'
            });
            instructorToken = res.data.data.token;
            console.log('✅ Instructor Registered');
        } catch (e) {
            // Login if exists
            console.log('⚠️ Registration failed, trying login...');
            // In a real script we'd handle this better, but for now assume fresh or unique email
        }

        // 2a. Create Question
        console.log('2a. Creating Question...');
        const qRes = await axios.post(`${API_URL}/questions`, {
            question_text: 'What is 2+2?',
            type: 'multiple-choice',
            options: ['3', '4', '5', '6'],
            correct_answer: '4',
            difficulty: 1, // Must be >= 0
            discrimination: 1.0,
            guessing: 0.25,
            topic: 'Math',
            points: 1
        }, { headers: { Authorization: `Bearer ${instructorToken}` } });
        const questionId = qRes.data.data.id;
        console.log('✅ Question Created:', questionId);

        // 2b. Create Exam
        console.log('2b. Creating Exam...');
        const examRes = await axios.post(`${API_URL}/exams`, {
            title: 'Simulation Exam ' + Date.now(),
            description: 'Automated Test',
            duration_minutes: 60,
            start_time: new Date().toISOString(),
            end_time: new Date(Date.now() + 3600000).toISOString(),
            is_adaptive: true,
            anti_cheat_enabled: true,
            question_ids: [questionId],
            questions: []
        }, { headers: { Authorization: `Bearer ${instructorToken}` } });
        examId = examRes.data.data.id;
        console.log('✅ Exam Created:', examId);

        // 3. Register Student
        console.log('3. Registering Student...');
        const studentRes = await axios.post(`${API_URL}/auth/register`, {
            email: `student_${Date.now()}@test.com`,
            password: 'password123',
            name: 'Test Student',
            role: 'student'
        });
        studentToken = studentRes.data.data.token;
        console.log('✅ Student Registered');

        // 4. Start Exam Attempt
        console.log('4. Starting Exam Attempt...');
        const attemptRes = await axios.post(`${API_URL}/attempts`, {
            examId
        }, { headers: { Authorization: `Bearer ${studentToken}` } });
        attemptId = attemptRes.data.data.id;
        console.log('✅ Attempt Started:', attemptId);

        // 5. Get Next Question (CAT)
        console.log('5. Getting Next Question...');
        const nextQRes = await axios.get(`${API_URL}/attempts/${attemptId}/next-question`, {
            headers: { Authorization: `Bearer ${studentToken}` }
        });

        if (nextQRes.data.data) {
            console.log('✅ Question Received:', nextQRes.data.data.id);

            // 6. Submit Answer
            console.log('6. Submitting Answer...');
            await axios.post(`${API_URL}/attempts/${attemptId}/submit`, {
                question_id: nextQRes.data.data.id,
                answer: 'Option A', // Dummy
                time_spent_seconds: 10
            }, { headers: { Authorization: `Bearer ${studentToken}` } });
            console.log('✅ Answer Submitted');
        } else {
            console.log('⚠️ No question received (Bank might be empty)');
        }

        // 7. Complete Exam
        console.log('7. Completing Exam...');
        await axios.post(`${API_URL}/attempts/${attemptId}/complete`, {}, {
            headers: { Authorization: `Bearer ${studentToken}` }
        });
        console.log('✅ Exam Completed');

        console.log('🎉 Simulation Finished Successfully!');

    } catch (error: any) {
        console.error('❌ Simulation Failed:', error.response?.data || error.message);
    }
}

runSimulation();
