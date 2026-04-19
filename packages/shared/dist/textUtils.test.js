import { describe, it, expect } from 'vitest';
import { addParagraphNumbers } from './textUtils.js';
describe('addParagraphNumbers', () => {
    it('returns empty string for empty input', () => {
        expect(addParagraphNumbers('')).toBe('');
    });
    it('numbers a single paragraph', () => {
        expect(addParagraphNumbers('Hello world')).toBe('[1] Hello world');
    });
    it('numbers multiple paragraphs separated by blank lines', () => {
        const input = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
        const expected = '[1] First paragraph.\n\n[2] Second paragraph.\n\n[3] Third paragraph.';
        expect(addParagraphNumbers(input)).toBe(expected);
    });
    it('collapses runs of 3+ newlines into paragraph breaks', () => {
        const input = 'A\n\n\n\nB';
        expect(addParagraphNumbers(input)).toBe('[1] A\n\n[2] B');
    });
    it('drops whitespace-only paragraphs', () => {
        const input = 'Real paragraph.\n\n   \n\nAnother real one.';
        expect(addParagraphNumbers(input)).toBe('[1] Real paragraph.\n\n[2] Another real one.');
    });
    it('trims per-paragraph whitespace', () => {
        expect(addParagraphNumbers('  padded  ')).toBe('[1] padded');
    });
    it('returns empty string when all paragraphs are whitespace', () => {
        expect(addParagraphNumbers('   \n\n   \n\n   ')).toBe('');
    });
});
//# sourceMappingURL=textUtils.test.js.map