import { supabaseAdmin } from '../config/supabase.js';
import bcrypt from 'bcrypt';

async function seed() {
    console.log('Seeding users...');
    const passwordHash = await bcrypt.hash('password123', 10);

    // Student
    const { error: studentError } = await supabaseAdmin.from('users').upsert({
        email: 'student@test.com',
        password_hash: passwordHash,
        name: 'Test Student',
        role: 'student',
        created_at: new Date().toISOString()
    }, { onConflict: 'email' });

    if (studentError) console.error('Student Error:', studentError);
    else console.log('Student seeded: student@test.com / password123');

    // Instructor
    const { error: instructorError } = await supabaseAdmin.from('users').upsert({
        email: 'instructor@test.com',
        password_hash: passwordHash,
        name: 'Test Instructor',
        role: 'instructor',
        created_at: new Date().toISOString()
    }, { onConflict: 'email' });

    if (instructorError) console.error('Instructor Error:', instructorError);
    else console.log('Instructor seeded: instructor@test.com / password123');

    // Get User IDs
    const { data: student } = await supabaseAdmin.from('users').select('id').eq('email', 'student@test.com').single();
    const { data: instructor } = await supabaseAdmin.from('users').select('id').eq('email', 'instructor@test.com').single();

    if (student && instructor) {
        // 1. Create Class
        const { data: newClass, error: classError } = await supabaseAdmin.from('classes').upsert({
            name: 'Test Class 101',
            description: 'A class for testing AI proctoring',
            instructor_id: instructor.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }).select().single();

        if (classError) console.error('Class Error:', classError);
        else console.log('Class seeded');

        if (newClass) {
            // 2. Add Student to Class
            const { error: joinError } = await supabaseAdmin.from('class_students').upsert({
                class_id: newClass.id,
                student_id: student.id,
                joined_at: new Date().toISOString()
            });

            if (joinError) console.error('Class Join Error:', joinError);
            else console.log('Student added to class');

            // 3. Create Question
            const { data: question, error: questionError } = await supabaseAdmin.from('questions').upsert({
                type: 'multiple-choice',
                question_text: 'What is 2 + 2?',
                options: ['3', '4', '5', '6'],
                correct_answer: '4',
                difficulty: 0.1,
                topic: 'Math',
                created_by: instructor.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).select().single();

            if (questionError) console.error('Question Error:', questionError);
            else console.log('Question seeded');

            if (question) {
                // 4. Create Exam
                const { data: exam, error: examError } = await supabaseAdmin.from('exams').upsert({
                    title: 'AI Proctoring Test Exam',
                    description: 'This exam tests the AI anti-cheat features.',
                    instructor_id: instructor.id,
                    duration_minutes: 60,
                    enable_cat: false,
                    enable_anti_cheat: true,
                    question_ids: [question.id],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).select().single();

                if (examError) console.error('Exam Error:', examError);
                else if (exam) {
                    console.log('Exam seeded');
                    // 5. Assign Exam to Class
                    const { error: assignError } = await supabaseAdmin.from('exam_assignments').upsert({
                        exam_id: exam.id,
                        class_id: newClass.id,
                        assigned_at: new Date().toISOString()
                    });

                    if (assignError) console.error('Assignment Error:', assignError);
                    else console.log('Exam assigned to class');
                }
            }
        }
    }
}

seed().catch(console.error);
