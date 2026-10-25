import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { SEVERITIES, CATEGORIES } from '../config/constants.js';

export const SYSTEM_PROMPT = `You are a world-class static code analysis engine and senior security engineer.
Your sole mission is to analyze the provided source or configuration file and detect REAL, ACTIONABLE problems.

You must identify:
1. Real bugs and logic defects (off-by-one errors, null pointer dereferences, unhandled edge cases).
2. Security vulnerabilities (injection, insecure deserialization, SSRF, hardcoded credentials, missing authorization, timing attacks).
3. Obvious performance problems (O(N^2) or worse loops where unnecessary, blocking synchronous I/O on event loops, N+1 queries).
4. Unsafe practices and potential crashes (unhandled rejections, race conditions, type confusion).
5. Incorrect or missing error handling (swallowing errors without logging or recovery, improper try/catch).
6. Resource leaks (unclosed sockets, unreleased DB connections, memory leaks, uncancelled timers).

Strict Rules:
- DO NOT report harmless stylistic preferences or formatting (e.g., quotes, semicolons, naming conventions).
- DO NOT report speculative findings without concrete evidence in the code.
- DO NOT produce duplicate findings for the same root cause.
- Include accurate, 1-indexed line numbers where the problem occurs.
- Clearly explain WHY it is a problem and provide a practical, concrete suggested fix.
- DO NOT rewrite the entire file.
- Return ONLY valid JSON adhering to the specified schema.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    problems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          line: { type: 'INTEGER' },
          severity: {
            type: 'STRING',
            enum: ['critical', 'high', 'medium', 'low'],
          },
          category: {
            type: 'STRING',
            enum: ['security', 'bug', 'performance', 'error-handling', 'resource-leak', 'unsafe-practice'],
          },
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          suggestedFix: { type: 'STRING' },
        },
        required: ['line', 'severity', 'category', 'title', 'description', 'suggestedFix'],
      },
    },
  },
  required: ['problems'],
};

export class GeminiService {
  /**
   * @param {string} [apiKey]
   * @param {string} [model]
   */
  constructor(apiKey = env.GEMINI_API_KEY, model = env.GEMINI_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  /**
   * Sanitizes and parses raw Gemini output into valid structured problems list.
   *
   * @param {string} rawText
   * @returns {{ problems: Array<object> }}
   */
  parseResponse(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return { problems: [] };
    }

    let cleaned = rawText.trim();

    // Strip markdown code fences if Gemini returned them despite responseMimeType
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      logger.error({ error: parseError.message, sample: cleaned.slice(0, 100) }, 'Failed to parse Gemini JSON');
      throw new Error(`Invalid JSON returned by Gemini: ${parseError.message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      return { problems: [] };
    }

    const rawProblems = Array.isArray(parsed.problems) ? parsed.problems : [];

    const validatedProblems = rawProblems
      .map((item) => {
        if (!item || typeof item !== 'object') return null;

        const lineNum = Number(item.line);
        const line = Number.isInteger(lineNum) && lineNum > 0 ? lineNum : 1;

        const rawSeverity = String(item.severity || '').toLowerCase();
        const severity = SEVERITIES.includes(rawSeverity) ? rawSeverity : 'medium';

        const rawCategory = String(item.category || '').toLowerCase();
        const category = CATEGORIES.includes(rawCategory) ? rawCategory : 'bug';

        return {
          line,
          severity,
          category,
          title: String(item.title || 'Code finding').trim(),
          description: String(item.description || '').trim(),
          suggestedFix: String(item.suggestedFix || '').trim(),
        };
      })
      .filter(Boolean);

    return { problems: validatedProblems };
  }

  /**
   * Analyzes a single file's content using Google Gemini API.
   *
   * @param {object} params
   * @param {string} params.filePath
   * @param {string} params.language
   * @param {string} params.content
   * @returns {Promise<{ problems: Array<object> }>}
   */
  async analyzeFile({ filePath, language, content }) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured on the server.');
    }

    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const promptText = `Analyze the following file for bugs, security vulnerabilities, and code quality issues:
File Path: ${filePath}
Language: ${language}

--- BEGIN FILE CONTENT ---
${content}
--- END FILE CONTENT ---`;

    const requestPayload = {
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: promptText }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.1,
      },
    };

    return withRetry(
      async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
          signal: AbortSignal.timeout(env.REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
          const status = response.status;
          let errorMessage = `Gemini API error (${status})`;

          try {
            const errorJson = await response.json();
            if (errorJson.error?.message) {
              errorMessage += `: ${errorJson.error.message}`;
            }
          } catch {
            // Ignore non-json body
          }

          const error = new Error(errorMessage);
          error.status = status;
          if (status === 429) {
            error.code = 'GEMINI_RATE_LIMIT';
          }
          throw error;
        }

        const data = await response.json();
        const candidateText =
          data.candidates?.[0]?.content?.parts?.[0]?.text || '{"problems": []}';

        return this.parseResponse(candidateText);
      },
      {
        operationName: `Gemini:analyzeFile(${filePath})`,
        maxRetries: env.GEMINI_MAX_RETRIES,
        baseDelayMs: env.GEMINI_RETRY_BASE_DELAY_MS,
      }
    );
  }
}

export const geminiService = new GeminiService();
