import { aphorismProgram } from './aphorism.js';
import { freeAssociationProgram } from './free-association.js';
import { voiceChainProgram } from './voice-chain.js';
// Re-export individual programs
export { aphorismProgram } from './aphorism.js';
export { freeAssociationProgram } from './free-association.js';
export { voiceChainProgram } from './voice-chain.js';
// ============================================================
// Program Registry
// ============================================================
const REGISTRY = {
    [aphorismProgram.id]: aphorismProgram,
    [freeAssociationProgram.id]: freeAssociationProgram,
    [voiceChainProgram.id]: voiceChainProgram,
};
/** Default program used when none is specified. */
export const DEFAULT_PROGRAM = 'aphorism';
/**
 * Look up a program by its id.
 * Falls back to the default (aphorism) program with a console warning
 * if the requested program is not found.
 */
export function getProgram(id) {
    const program = REGISTRY[id];
    if (program)
        return program;
    console.warn(`[programs] Unknown program "${id}", falling back to "${DEFAULT_PROGRAM}"`);
    return REGISTRY[DEFAULT_PROGRAM];
}
/** List all registered programs. */
export function listPrograms() {
    return Object.values(REGISTRY);
}
//# sourceMappingURL=index.js.map