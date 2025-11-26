import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(API_KEY);

interface GeneratedQuestion {
  content: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  difficulty: number;
  discrimination: number;
  guessing: number;
  topic: string;
}

export class GeminiService {
  private model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  async generateQuestions(topic: string, difficulty: number, count: number = 5): Promise<GeneratedQuestion[]> {
    if (!API_KEY) {
      console.warn('Gemini API Key is missing. Returning mock questions.');
      return this.getMockQuestions(topic, difficulty, count);
    }

    const prompt = `
      Generate ${count} multiple-choice questions for the topic "${topic}" with a difficulty level of ${difficulty} (on a scale of -3.0 to 3.0, where 0 is average).
      
      Format the output strictly as a JSON array of objects. Each object must have:
      - "content": The question text.
      - "options": An array of 4 possible answers.
      - "correct_answer": The exact string of the correct option.
      - "explanation": A brief explanation of why the answer is correct.
      - "difficulty": The estimated IRT difficulty parameter (b) close to ${difficulty}.
      - "discrimination": An estimated IRT discrimination parameter (a), typically between 0.5 and 2.5.
      - "guessing": An estimated guessing parameter (c), typically around 0.25 for 4 options.
      
      Do not include markdown formatting like \`\`\`json. Just return the raw JSON string.
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Clean up potential markdown code blocks if Gemini adds them
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

      const questions: GeneratedQuestion[] = JSON.parse(cleanText);
      return questions.map(q => ({ ...q, topic }));
    } catch (error) {
      console.error('Error generating questions with Gemini:', error);
      return this.getMockQuestions(topic, difficulty, count);
    }
  }

  private getMockQuestions(topic: string, difficulty: number, count: number): GeneratedQuestion[] {
    return Array(count).fill(null).map((_, i) => ({
      content: `Mock Question ${i + 1} about ${topic} (Diff: ${difficulty})`,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correct_answer: 'Option A',
      explanation: 'This is a mock explanation.',
      difficulty: difficulty,
      discrimination: 1.0,
      guessing: 0.25,
      topic: topic
    }));
  }
}

export const geminiService = new GeminiService();
