import { describe, it, expect } from 'vitest';
import { addParagraphNumbers } from './textUtils.js';

describe('addParagraphNumbers', () => {
  it('numbers multiple paragraphs', () => {
    const result = addParagraphNumbers('First para\n\nSecond para');
    expect(result).toBe('[1] First para\n\n[2] Second para');
  });

  it('handles a single paragraph', () => {
    expect(addParagraphNumbers('Only one')).toBe('[1] Only one');
  });

  it('returns empty string for empty input', () => {
    expect(addParagraphNumbers('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(addParagraphNumbers('   \n\n   ')).toBe('');
  });

  it('collapses multiple blank lines between paragraphs', () => {
    const result = addParagraphNumbers('A\n\n\n\nB\n\n\nC');
    expect(result).toBe('[1] A\n\n[2] B\n\n[3] C');
  });

  it('trims whitespace from individual paragraphs', () => {
    const result = addParagraphNumbers('  padded  \n\n  also padded  ');
    expect(result).toBe('[1] padded\n\n[2] also padded');
  });
});
