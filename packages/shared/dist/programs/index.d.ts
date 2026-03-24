import type { ConversationProgram } from './types.js';
export type { ConversationProgram, StageConfig, PrintLayout, ResultDisplay, PromptParams, } from './types.js';
export { aphorismProgram } from './aphorism.js';
export { freeAssociationProgram } from './free-association.js';
export { voiceChainProgram } from './voice-chain.js';
/** Default program used when none is specified. */
export declare const DEFAULT_PROGRAM = "aphorism";
/**
 * Look up a program by its id.
 * Falls back to the default (aphorism) program with a console warning
 * if the requested program is not found.
 */
export declare function getProgram(id: string): ConversationProgram;
/** List all registered programs. */
export declare function listPrograms(): ConversationProgram[];
//# sourceMappingURL=index.d.ts.map