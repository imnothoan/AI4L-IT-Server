import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from '../config/supabase.js';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const SUBJECTS = [
    { name: 'Toán', topics: ['Đại số', 'Hình học', 'Giải tích', 'Xác suất thống kê'] },
    { name: 'Vật Lý', topics: ['Cơ học', 'Điện học', 'Quang học', 'Nhiệt học'] },
    { name: 'Hóa Học', topics: ['Hóa vô cơ', 'Hóa hữu cơ', 'Hóa phân tích', 'Điện hóa'] },
    { name: 'Sinh Học', topics: ['Sinh học tế bào', 'Di truyền', 'Sinh thái', 'Tiến hóa'] },
    { name: 'Tiếng Anh', topics: ['Grammar', 'Vocabulary', 'Reading', 'Writing'] },
    { name: 'Ngữ Văn', topics: ['Văn học', 'Nghị luận', 'Làm văn', 'Ngữ pháp'] },
    { name: 'Lịch Sử', topics: ['Lịch sử Việt Nam', 'Lịch sử thế giới', 'Cách mạng'] },
    { name: 'Địa Lý', topics: ['Địa lý tự nhiên', 'Địa lý kinh tế', 'Bản đồ'] }
];

const GRADES = [10, 11, 12];
const BATCH_SIZE = 20; // Questions per API call
const TARGET_TOTAL = 15000;
const DELAY_BETWEEN_CALLS = 2000; // 2 seconds to avoid rate limits

interface GeneratedQuestion {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
    topic: string;
    difficulty: number;
    irtParameters: { a: number; b: number; c: number };
}

async function generateQuestionBatch(
    subject: string,
    topic: string,
    grade: number,
    count: number
): Promise<GeneratedQuestion[]> {
    const prompt = `<role>
Bạn là giáo sư PhD chuyên ngành ${subject}, chuyên gia thiết kế đề thi chuẩn quốc tế.
</role>

<task>
Tạo ${count} câu hỏi trắc nghiệm chất lượng cao cho:
- Môn: ${subject}
- Chủ đề: ${topic}
- Lớp: ${grade}
- Chuẩn: Bộ GD&ĐT Việt Nam

YÊU CẦU IRT (Item Response Theory):
Ước lượng chính xác các tham số 3PL:

**a (Discrimination):** 0.5-2.5
- 0.5-0.9: Câu phân biệt yếu (đáp án mơ hồ)
- 1.0-1.5: Phân biệt trung bình (câu chuẩn)
- 1.6-2.5: Phân biệt tốt (rõ ràng giỏi/dốt)

**b (Difficulty):** -3.0 to +3.0
- -3 to -1.5: Rất dễ (80%+ học sinh làm đúng)
- -1.5 to -0.5: Dễ (60-80% đúng)
- -0.5 to +0.5: Trung bình (40-60% đúng)
- +0.5 to +1.5: Khó (20-40% đúng)
- +1.5 to +3.0: Rất khó (<20% đúng)

**c (Guessing):** 0.20-0.30
- Với 4 đáp án: c ≈ 0.25 (xác suất đoán mò)
- Câu khó có thể c = 0.20 (ít đoán được)
- Câu dễ có thể c = 0.28 (dễ loại trừ sai)

CHẤT LƯỢNG:
1. Câu hỏi phải chính xác 100% về kiến thức
2. Đáp án sai phải hợp lý, dễ nhầm
3. Giải thích chi tiết, dễ hiểu
4. Không trùng lặp với các ví dụ
5. Phù hợp tâm lý học sinh lớp ${grade}
</task>

<examples>
VÍ DỤ 1 (Toán - Dễ):
{
  "question": "Tính giá trị của biểu thức: 3x + 5 khi x = 2",
  "options": ["10", "11", "13", "16"],
  "correctAnswer": 1,
  "explanation": "Thay x = 2 vào biểu thức: 3(2) + 5 = 6 + 5 = 11",
  "topic": "Đại số cơ bản",
  "difficulty": 0.2,
  "irtParameters": { "a": 1.0, "b": -1.2, "c": 0.25 }
}

VÍ DỤ 2 (Vật Lý - Khó):
{
  "question": "Một vật chuyển động thẳng biến đổi đều với gia tốc 2 m/s². Sau 5 giây, vận tốc đạt 20 m/s. Vận tốc ban đầu là:",
  "options": ["5 m/s", "8 m/s", "10 m/s", "12 m/s"],
  "correctAnswer": 2,
  "explanation": "Áp dụng công thức v = v₀ + at. Ta có: 20 = v₀ + 2×5. Suy ra v₀ = 10 m/s",
  "topic": "Chuyển động thẳng biến đổi đều",
  "difficulty": 0.7,
  "irtParameters": { "a": 1.8, "b": 1.2, "c": 0.23 }
}
</examples>

<output_format>
Trả về JSON array thuần túy (KHÔNG có markdown, KHÔNG có ```json):
        [
            {
                "question": "...",
                "options": ["A", "B", "C", "D"],
    "correctAnswer": 0,
        "explanation": "...",
            "topic": "${topic}",
                "difficulty": 0.5,
                    "irtParameters": { "a": 1.2, "b": 0.5, "c": 0.25 }
}
]
</output_format>`;

try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Clean up markdown fences
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const questions = JSON.parse(text);
    console.log(`✅ Generated ${questions.length} questions for ${subject} - ${topic}`);
    return questions;

} catch (error: any) {
    console.error(`❌ Gemini error for ${subject} - ${topic}:`, error.message);

    // Mock fallback
    return Array.from({ length: count }).map((_, i) => ({
        question: `[MOCK] Câu ${i + 1}: ${subject} - ${topic} (Lớp ${grade})`,
        options: ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
        correctAnswer: Math.floor(Math.random() * 4),
        explanation: "Giải thích mock tự động",
        topic: topic,
        difficulty: Math.random(),
        irtParameters: {
            a: 0.8 + Math.random() * 1.5,
            b: -2 + Math.random() * 4,
            c: 0.22 + Math.random() * 0.06
        }
    }));
}
}

async function saveQuestionBatch(questions: GeneratedQuestion[], subject: string, grade: number) {
    const dbQuestions = questions.map(q => ({
        question: q.question,
        type: 'multiple-choice',
        options: q.options,
        correct_answer: q.options[q.correctAnswer],
        explanation: q.explanation,
        topic: q.topic,
        difficulty: q.difficulty,
        irt_parameters: q.irtParameters,
        grade_level: { system: 'high-school', grade },
        subject: { main: subject },
        created_at: new Date().toISOString(),
        version: 1,
        status: 'approved',
        exposure_count: 0,
        max_exposure: 20
    }));

    const { data, error } = await supabaseAdmin
        .from('questions')
        .insert(dbQuestions)
        .select('id');

    if (error) {
        console.error('❌ Database error:', error.message);
        return 0;
    }

    return data?.length || 0;
}

async function main() {
    console.log('🚀 BATCH GENERATION START');
    console.log(`📊 Target: ${TARGET_TOTAL} questions`);
    console.log(`📦 Batch size: ${BATCH_SIZE} questions/call`);
    console.log(`⏱️  Delay: ${DELAY_BETWEEN_CALLS}ms between calls\n`);

    let totalGenerated = 0;
    let totalSaved = 0;
    const startTime = Date.now();

    // Calculate distribution
    const questionsPerSubject = Math.floor(TARGET_TOTAL / SUBJECTS.length);

    for (const subject of SUBJECTS) {
        console.log(`\n📚 Subject: ${subject.name}`);

        const questionsPerTopic = Math.floor(questionsPerSubject / subject.topics.length);

        for (const topic of subject.topics) {
            const questionsForThisTopic = questionsPerTopic;
            const batches = Math.ceil(questionsForThisTopic / BATCH_SIZE);

            for (let batch = 0; batch < batches; batch++) {
                const count = Math.min(BATCH_SIZE, questionsForThisTopic - batch * BATCH_SIZE);
                const grade = GRADES[Math.floor(Math.random() * GRADES.length)];

                console.log(`  📝 ${topic} (Grade ${grade}) - Batch ${batch + 1}/${batches} (${count} Qs)`);

                const questions = await generateQuestionBatch(subject.name, topic, grade, count);
                totalGenerated += questions.length;

                const saved = await saveQuestionBatch(questions, subject.name, grade);
                totalSaved += saved;

                console.log(`     ✓ Saved ${saved}/${questions.length} questions`);
                console.log(`     📊 Progress: ${totalSaved}/${TARGET_TOTAL} (${((totalSaved / TARGET_TOTAL) * 100).toFixed(1)}%)`);

                // Rate limit protection
                if (batch < batches - 1) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS));
                }
            }
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 BATCH GENERATION COMPLETE');
    console.log(`✅ Total generated: ${totalGenerated}`);
    console.log(`💾 Total saved: ${totalSaved}`);
    console.log(`⏱️  Time elapsed: ${elapsed} minutes`);
    console.log(`📈 Rate: ${(totalSaved / parseFloat(elapsed)).toFixed(0)} questions/min`);
    console.log('='.repeat(60));
}

main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});
