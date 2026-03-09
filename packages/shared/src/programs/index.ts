import type { ConversationProgram } from './types.js';
import { aphorismProgram } from './aphorism.js';
import { freeAssociationProgram } from './free-association.js';

// Re-export types for convenience
export type {
  ConversationProgram,
  StageConfig,
  PrintLayout,
  ResultDisplay,
  PromptParams,
} from './types.js';

// Re-export individual programs
export { aphorismProgram } from './aphorism.js';
export { freeAssociationProgram } from './free-association.js';

// ============================================================
// Program Registry
// ============================================================

const REGISTRY: Record<string, ConversationProgram> = {
  [aphorismProgram.id]: aphorismProgram,
  [freeAssociationProgram.id]: freeAssociationProgram,
};

/** Default program used when none is specified. */
export const DEFAULT_PROGRAM = 'aphorism';

/**
 * Look up a program by its id.
 * Falls back to the default (aphorism) program with a console warning
 * if the requested program is not found.
 */
export function getProgram(id: string): ConversationProgram {
  const program = REGISTRY[id];
  if (program) return program;

  console.warn(
    `[programs] Unknown program "${id}", falling back to "${DEFAULT_PROGRAM}"`,
  );
  return REGISTRY[DEFAULT_PROGRAM]!;
}

/** List all registered programs. */
export function listPrograms(): ConversationProgram[] {
  return Object.values(REGISTRY);
}
