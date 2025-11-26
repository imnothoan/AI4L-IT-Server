import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from '../config/supabase.js';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const SUBJECTS = [
    'Toán Học',
    'Vật Lý',
    'Hóa Học',
    'Sinh Học',
    'Tiếng Anh',
    'Ngữ Văn',
    'Lịch Sử',
    'Địa Lý',
    'GDCD'
];
const GRADES = [10, 11, 12];
const BATCH_SIZE = 5; // Questions per prompt (reduced to avoid quota issues)
const TOTAL_QUESTIONS = 1000; // Start with 1K test batch

/**
 * Enhanced PhD-level prompt for question generation
 * Based on research: high-quality prompts improve IRT parameter accuracy
 */
async function generateQuestionsBatch(subject: string, grade: number): Promise<any[]> {
    const prompt = `
Bạn là một Tiến sĩ chuyên ngành ${subject} với 20+ năm kinh nghiệm giảng dạy cấp THPT và biên soạn đề thi quốc gia.

NHIỆM VỤ: Tạo ${BATCH_SIZE} câu hỏi trắc nghiệm chất lượng cao cho môn ${subject} lớp ${grade} theo chuẩn Bộ Giáo dục & Đào tạo Việt Nam.

YÊU CẦU CHẤT LƯỢNG:
1. **Nội dung**: Chính xác 100%, phù hợp chương trình SGK, độ khó phân tầng rõ ràng
2. **Ngôn ngữ**: Tiếng Việt chuẩn, rõ ràng, không gây nhầm lẫn
3. **Đáp án nhiễu**: Có lý do hợp lý, dễ nhầm lẫn với đáp án đúng
4. **Giải thích**: Chi tiết, dẫn chứng cơ sở lý thuyết, công thức (nếu có)
5. **Đa dạng**: Bao phủ nhiều chủ đề khác nhau trong môn học

PHÂN BỐ ĐỘ KHÓ (IRT b parameter):
- 2 câu DỄ (b = -1.5 đến -0.5): Kiến thức cơ bản, nhớ đơn giản
- 2 câu TRUNG BÌNH (b = -0.5 đến 1.0): Hiểu và vận dụng
- 1 câu KHÓ (b = 1.0 đến 2.5): Vận dụng cao, tư duy phản biện

THAM SỐ IRT (Item Response Theory):
- **a (Discrimination)**: 0.8 - 2.5
  - Câu dễ: a ≈ 1.0 (phân biệt vừa)
  - Câu khó: a ≈ 1.8 (phân biệt cao, giỏi/dốt rõ ràng)
- **b (Difficulty)**: -2.0 đến 2.5
  - Âm: Dễ (học sinh yếu làm được)
  - Dương: Khó (chỉ học sinh giỏi làm được)
- **c (Guessing)**: 0.20 - 0.30
  - Trắc nghiệm 4 đáp án: c ≈ 0.25 (xác suất đoán ngẫu nhiên)
  - Đáp án nhiễu tốt: c ≈ 0.20 (khó đoán hơn)

OUTPUT: Trả về JSON array KHÔNG CÓ MARKDOWN (thuần túy):
[
  {
    "question": "Nội dung câu hỏi chi tiết...",
    "options": [
      "A. Đáp án A (đầy đủ, không viết tắt)",
      "B. Đáp án B",
      "C. Đáp án C",
      "D. Đáp án D"
    ],
    "correctAnswer": 0,
    "explanation": "Giải thích chi tiết: Bước 1... Bước 2... Kết luận...",
    "topic": "Chủ đề cụ thể trong chương trình (VD: Hàm số bậc 2, Động học chất điểm, ...)",
    "difficulty": 0.5,
    "bloomLevel": "Nhớ|Hiểu|Vận dụng|Vận dụng cao|Phân tích|Tổng hợp|Đánh giá",
    "irtParameters": {
      "a": 1.5,
      "b": 0.8,
      "c": 0.25
    },
    "metadata": {
      "estimatedTime": 90,
      "relatedTopics": ["Chủ đề liên quan 1", "Chủ đề 2"],
      "prerequisiteKnowledge": ["Kiến thức nền cần có"]
    }
  }
]

LƯU Ý: 
- Đảm bảo JSON hợp lệ, không có ký tự đặc biệt chưa escape
- KHÔNG thêm \`\`\`json hoặc markdown, chỉ trả về array
- Mỗi câu hỏi phải độc lập, không trùng lặp nội dung
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // Clean up response (remove markdown if present)
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        const questions = JSON.parse(text);

        // Validate IRT parameters
        if (Array.isArray(questions)) {
            questions.forEach((q, idx) => {
                if (!q.irtParameters || !q.irtParameters.a || !q.irtParameters.b) {
                    console.warn(`Question ${idx} missing IRT params, using defaults`);
                    q.irtParameters = {
                        a: 1.0 + Math.random(),
                        b: -2 + Math.random() * 4,
                        c: 0.25
                    };
                }

                // Ensure within bounds
                q.irtParameters.a = Math.max(0.5, Math.min(2.5, q.irtParameters.a));
                q.irtParameters.b = Math.max(-3, Math.min(3, q.irtParameters.b));
                q.irtParameters.c = Math.max(0, Math.min(0.35, q.irtParameters.c));
            });
        }

        return questions;
    } catch (error: any) {
        console.error(`❌ Gemini generation failed for ${subject} Grade ${grade}:`, error.message);

        // Fallback to high-quality mock
        return Array.from({ length: BATCH_SIZE }).map((_, i) => ({
            question: `[Mock ${subject} Lớp ${grade}] Câu ${i + 1}: Đây là câu hỏi giả lập chất lượng cao về ${subject}. Nội dung chi tiết sẽ được bổ sung sau.`,
            options: [
                "A. Đáp án A - Mô tả chi tiết",
                "B. Đáp án B - Đáp án nhiễu hợp lý",
                "C. Đáp án C - Đáp án nhiễu khác",
                "D. Đáp án D - Đáp án cuối"
            ],
            correctAnswer: Math.floor(Math.random() * 4),
            explanation: `Giải thích chi tiết: Câu hỏi này kiểm tra kiến thức về ${subject}. Đáp án đúng vì... Các đáp án sai vì...`,
            topic: `Chủ đề mẫu ${i + 1}`,
            difficulty: 0.2 + Math.random() * 0.6,
            bloomLevel: ['Nhớ', 'Hiểu', 'Vận dụng'][Math.floor(Math.random() * 3)],
            irtParameters: {
                a: 0.8 + Math.random() * 1.5,
                b: -1.5 + Math.random() * 3,
                c: 0.25
            },
            metadata: {
                estimatedTime: 60 + Math.floor(Math.random() * 60),
                relatedTopics: [`Topic ${i + 1}`],
                prerequisiteKnowledge: ["Kiến thức cơ bản"]
            }
        }));
    }
}

async function main() {
    console.log(`\n🚀 Starting generation of ${TOTAL_QUESTIONS} high-quality questions...\n`);
    console.log(`📚 Subjects: ${SUBJECTS.join(', ')}`);
    console.log(`🎓 Grades: ${GRADES.join(', ')}`);
    console.log(`📦 Batch size: ${BATCH_SIZE}`);
    console.log(`🤖 Model: Gemini 1.5 Flash (PhD-level prompts)\n`);

    let count = 0;
    let geminiSuccesses = 0;
    let geminiFailures = 0;

    while (count < TOTAL_QUESTIONS) {
        const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
        const grade = GRADES[Math.floor(Math.random() * GRADES.length)];

        console.log(`📝 Generating batch ${Math.floor(count / BATCH_SIZE) + 1}/${Math.ceil(TOTAL_QUESTIONS / BATCH_SIZE)}: ${subject} Grade ${grade}...`);

        const questions = await generateQuestionsBatch(subject, grade);

        if (questions.length > 0) {
            // Check if real or fallback
            const isReal = !questions[0].question.includes('[Mock');
            if (isReal) geminiSuccesses++;
            else geminiFailures++;

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
                metadata: q.metadata || {},
                bloom_level: q.bloomLevel || 'Hiểu',
                generated_by: 'gemini-1.5-flash-phd'
            }));

            const { error } = await supabaseAdmin.from('questions').insert(dbQuestions);

            if (error) {
                console.error('❌ DB Insert Error:', error.message);
            } else {
                count += questions.length;
                console.log(`✅ Saved ${questions.length} ${isReal ? 'real' : 'mock'} questions. Total: ${count}/${TOTAL_QUESTIONS} (Gemini: ${geminiSuccesses}/${geminiSuccesses + geminiFailures})\n`);
            }
        }

        // Rate limit protection (Gemini free tier: 60 req/min)
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log('\n🎉 Generation complete!');
    console.log(`📊 Stats:`);
    console.log(`   - Total: ${count} questions`);
    console.log(`   - Gemini successes: ${geminiSuccesses}`);
    console.log(`   - Fallback mocks: ${geminiFailures}`);
    console.log(`   - Success rate: ${((geminiSuccesses / (geminiSuccesses + geminiFailures)) * 100).toFixed(1)}%\n`);
}

main().catch(console.error);
