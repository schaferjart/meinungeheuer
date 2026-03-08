import { describe, it, expect } from 'vitest';
import { mapRole } from './useConversation';

describe('mapRole', () => {
  it('maps "user" to "visitor"', () => {
    expect(mapRole('user')).toBe('visitor');
  });

  it('maps "agent" to "agent"', () => {
    expect(mapRole('agent')).toBe('agent');
  });

  // Defensive: if somehow "ai" (old SDK value) is passed at runtime
  it('maps any non-"user" value to "agent"', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(mapRole('ai' as any)).toBe('agent');
  });
});
