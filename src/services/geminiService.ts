import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';
import type {
  QuestionGenerationRequest,
  EssayGradingRequest,
  EssayGradingResult,
  Question
} from '../types/index.js';

class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor() {
    if (config.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    }
  }

  private ensureInitialized(): void {
    if (!this.model) {
      throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in environment variables.');
    }
  }

  /**
   * Generate questions based on topic and parameters
   */
  async generateQuestions(params: QuestionGenerationRequest): Promise<Partial<Question>[]> {
    this.ensureInitialized();

    const prompt = this.buildQuestionPrompt(params);
    
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Parse JSON response
      const cleanText = this.extractJSON(text);
      const questions = JSON.parse(cleanText);
      
      return questions.map((q: any) => ({
        type: params.type,
        question_text: q.question,
        options: q.options,
        correct_answer: q.correct_answer,
        difficulty: params.difficulty,
        topic: params.topic,
        explanation: q.explanation
      }));
    } catch (error) {
      console.error('Error generating questions:', error);
      throw new Error('Failed to generate questions with Gemini AI');
    }
  }

  /**
   * Grade an essay using AI
   */
  async gradeEssay(params: EssayGradingRequest): Promise<EssayGradingResult> {
    this.ensureInitialized();

    const prompt = this.buildEssayGradingPrompt(params);
    
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const cleanText = this.extractJSON(text);
      const grading = JSON.parse(cleanText);
      
      return {
        score: grading.score,
        feedback: grading.feedback,
        strengths: grading.strengths || [],
        improvements: grading.improvements || [],
        breakdown: grading.breakdown
      };
    } catch (error) {
      console.error('Error grading essay:', error);
      throw new Error('Failed to grade essay with Gemini AI');
    }
  }

  /**
   * Build prompt for question generation
   */
  private buildQuestionPrompt(params: QuestionGenerationRequest): string {
    const languageInstruction = params.language === 'vi' 
      ? 'Tạo câu hỏi bằng TIẾNG VIỆT.'
      : 'Generate questions in ENGLISH.';

    const gradeContext = this.getGradeContext(params.grade_level);
    const subjectContext = this.getSubjectContext(params.subject);
    const difficultyContext = this.getDifficultyContext(params.difficulty);

    if (params.type === 'multiple-choice') {
      return `${languageInstruction}

Bạn là giáo viên chuyên nghiệp. Hãy tạo ${params.count} câu hỏi trắc nghiệm về chủ đề: "${params.topic}".

${gradeContext}
${subjectContext}
${difficultyContext}

Yêu cầu:
- Mỗi câu hỏi phải có 4 đáp án (A, B, C, D)
- Chỉ có 1 đáp án đúng
- Câu hỏi phải rõ ràng, không gây nhầm lẫn
- Đáp án sai phải hợp lý để phân biệt học sinh hiểu bài và học vẹt
- Cung cấp giải thích ngắn gọn cho đáp án đúng

Trả về kết quả dưới dạng JSON array với format:
[
  {
    "question": "Nội dung câu hỏi",
    "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
    "correct_answer": 0,
    "explanation": "Giải thích tại sao đáp án này đúng"
  }
]

CHỈ trả về JSON, KHÔNG thêm text khác.`;
    } else {
      return `${languageInstruction}

Bạn là giáo viên chuyên nghiệp. Hãy tạo ${params.count} câu hỏi tự luận về chủ đề: "${params.topic}".

${gradeContext}
${subjectContext}
${difficultyContext}

Yêu cầu:
- Câu hỏi mở, yêu cầu học sinh phân tích, giải thích
- Phù hợp để đánh giá hiểu biết sâu sắc
- Cung cấp gợi ý điểm chính cho câu trả lời mẫu

Trả về kết quả dưới dạng JSON array với format:
[
  {
    "question": "Nội dung câu hỏi tự luận",
    "explanation": "Các điểm chính cần có trong câu trả lời"
  }
]

CHỈ trả về JSON, KHÔNG thêm text khác.`;
    }
  }

  /**
   * Build prompt for essay grading
   */
  private buildEssayGradingPrompt(params: EssayGradingRequest): string {
    const rubricSection = params.rubric 
      ? `Tiêu chí chấm điểm:\n${params.rubric}`
      : `Tiêu chí chấm điểm (tổng ${params.max_score} điểm):
- Nội dung đúng, đầy đủ: 40%
- Cách trình bày logic, mạch lạc: 30%
- Ngữ pháp, chính tả: 20%
- Sáng tạo, ý tưởng độc đáo: 10%`;

    return `Bạn là giáo viên chuyên nghiệp đang chấm bài tự luận.

Câu hỏi: "${params.question}"

Bài làm của học sinh:
"${params.answer}"

${rubricSection}

Hãy chấm điểm bài làm và đưa ra nhận xét chi tiết.

Trả về kết quả dưới dạng JSON với format:
{
  "score": 85,
  "feedback": "Nhận xét tổng quan về bài làm...",
  "strengths": [
    "Điểm mạnh 1",
    "Điểm mạnh 2"
  ],
  "improvements": [
    "Gợi ý cải thiện 1",
    "Gợi ý cải thiện 2"
  ],
  "breakdown": {
    "content": 35,
    "presentation": 28,
    "grammar": 18,
    "creativity": 9
  }
}

CHỈ trả về JSON, KHÔNG thêm text khác.`;
  }

  /**
   * Get grade level context for prompts
   */
  private getGradeContext(gradeLevel?: string): string {
    switch (gradeLevel) {
      case 'elementary':
        return 'Cấp độ: Tiểu học (lớp 1-5). Câu hỏi đơn giản, dễ hiểu.';
      case 'middle':
        return 'Cấp độ: Trung học cơ sở (lớp 6-9). Câu hỏi vừa phải, có tư duy.';
      case 'high':
        return 'Cấp độ: Trung học phổ thông (lớp 10-12). Câu hỏi nâng cao, phân tích.';
      case 'university':
        return 'Cấp độ: Đại học. Câu hỏi chuyên sâu, nghiên cứu.';
      default:
        return '';
    }
  }

  /**
   * Get subject context for prompts
   */
  private getSubjectContext(subject?: string): string {
    switch (subject) {
      case 'math':
        return 'Môn: Toán học. Tập trung vào logic, tính toán, công thức.';
      case 'literature':
        return 'Môn: Ngữ văn. Tập trung vào phân tích văn bản, diễn đạt.';
      case 'science':
        return 'Môn: Khoa học. Tập trung vào hiện tượng, thí nghiệm, nguyên lý.';
      case 'history':
        return 'Môn: Lịch sử. Tập trung vào sự kiện, nhân vật, mốc thời gian.';
      case 'english':
        return 'Môn: Tiếng Anh. Tập trung vào ngữ pháp, từ vựng, đọc hiểu.';
      default:
        return '';
    }
  }

  /**
   * Get difficulty context for prompts
   */
  private getDifficultyContext(difficulty: number): string {
    if (difficulty < 0.3) {
      return 'Độ khó: DỄ. Câu hỏi cơ bản, kiểm tra kiến thức nhớ.';
    } else if (difficulty < 0.7) {
      return 'Độ khó: TRUNG BÌNH. Câu hỏi yêu cầu hiểu và vận dụng.';
    } else {
      return 'Độ khó: KHÓ. Câu hỏi yêu cầu phân tích, tổng hợp, sáng tạo.';
    }
  }

  /**
   * Extract JSON from response text (handles markdown code blocks)
   */
  private extractJSON(text: string): string {
    // Remove markdown code blocks if present
    let cleaned = text.trim();
    
    // Remove ```json ... ```
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    
    // Find JSON array or object
    const jsonMatch = cleaned.match(/[\[\{][\s\S]*[\]\}]/);
    if (jsonMatch) {
      return jsonMatch[0];
    }
    
    return cleaned;
  }

  /**
   * Check if Gemini API is available
   */
  isAvailable(): boolean {
    return this.model !== null;
  }
}

export const geminiService = new GeminiService();
export default geminiService;
