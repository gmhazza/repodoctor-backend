import { describe, it, expect } from 'vitest';
import { GeminiService } from '../src/services/gemini.service.js';

describe('GeminiService parseResponse', () => {
  const service = new GeminiService('mock-api-key');

  it('parses valid structured JSON output with problems', () => {
    const raw = JSON.stringify({
      problems: [
        {
          line: 42,
          severity: 'high',
          category: 'security',
          title: 'Missing authentication check',
          description: 'The endpoint does not verify the user status.',
          suggestedFix: 'Add authentication middleware.',
        },
      ],
    });

    const parsed = service.parseResponse(raw);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toEqual({
      line: 42,
      severity: 'high',
      category: 'security',
      title: 'Missing authentication check',
      description: 'The endpoint does not verify the user status.',
      suggestedFix: 'Add authentication middleware.',
    });
  });

  it('parses JSON with markdown fences', () => {
    const raw = '```json\n{"problems": [{"line": 10, "severity": "low", "category": "performance", "title": "Loop optimization", "description": "Cache length", "suggestedFix": "Store length"}]}\n```';

    const parsed = service.parseResponse(raw);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0].line).toBe(10);
    expect(parsed.problems[0].severity).toBe('low');
  });

  it('handles empty problems list', () => {
    const raw = JSON.stringify({ problems: [] });
    const parsed = service.parseResponse(raw);
    expect(parsed).toEqual({ problems: [] });
  });

  it('throws an error on completely malformed JSON', () => {
    const raw = '{ problems: invalid json without quotes ';
    expect(() => service.parseResponse(raw)).toThrow(/Invalid JSON/);
  });

  it('handles unexpected schema gracefully by applying defaults and filtering invalid entries', () => {
    const raw = JSON.stringify({
      problems: [
        {
          line: 'invalid-number',
          severity: 'unknown-severity',
          category: 'unknown-category',
          title: 'Weird finding',
        },
        null,
        'not-an-object',
      ],
    });

    const parsed = service.parseResponse(raw);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0].line).toBe(1); // default line
    expect(parsed.problems[0].severity).toBe('medium'); // fallback severity
    expect(parsed.problems[0].category).toBe('bug'); // fallback category
    expect(parsed.problems[0].title).toBe('Weird finding');
  });

  it('returns empty problems array if problems key is missing from JSON object', () => {
    const raw = JSON.stringify({ findings: [] });
    const parsed = service.parseResponse(raw);
    expect(parsed).toEqual({ problems: [] });
  });
});
