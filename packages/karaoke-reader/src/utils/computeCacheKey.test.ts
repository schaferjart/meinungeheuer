import { describe, it, expect } from 'vitest';
import { computeCacheKey } from './computeCacheKey.js';

describe('computeCacheKey', () => {
  it('returns a 64-character lowercase hex string', async () => {
    const key = await computeCacheKey('hello world', 'voice1');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic (same inputs produce same output)', async () => {
    const key1 = await computeCacheKey('test text', 'voiceA');
    const key2 = await computeCacheKey('test text', 'voiceA');
    expect(key1).toBe(key2);
  });

  it('normalizes whitespace (extra spaces produce same key)', async () => {
    const key1 = await computeCacheKey('hello  world', 'v1');
    const key2 = await computeCacheKey('hello world', 'v1');
    expect(key1).toBe(key2);
  });

  it('differentiates by voiceId (same text, different voice)', async () => {
    const key1 = await computeCacheKey('same text', 'voice1');
    const key2 = await computeCacheKey('same text', 'voice2');
    expect(key1).not.toBe(key2);
  });

  it('differentiates by text (different text, same voice)', async () => {
    const key1 = await computeCacheKey('text one', 'voice1');
    const key2 = await computeCacheKey('text two', 'voice1');
    expect(key1).not.toBe(key2);
  });
});
