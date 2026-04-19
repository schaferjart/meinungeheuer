import type { Definition } from '@denkfink/installation-core';
import { supabase } from './supabase.js';

// Local minimal type for what we read from chain_state
interface ChainStateRow {
  id: string;
  definition_id: string | null;
  is_active: boolean | null;
  created_at: string;
}

export interface ChainContext {
  chainState: ChainStateRow;
  definition: Definition;
}

/**
 * Fetches the currently active chain_state entry together with its definition.
 * Returns null if no active chain entry exists yet.
 */
export async function getActiveChainContext(): Promise<ChainContext | null> {
  // Step 1: get the active chain_state row
  const { data: chainState, error: chainError } = await supabase
    .from('chain_state')
    .select('id, definition_id, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (chainError) {
    console.error('[chain] getActiveChainContext chain_state fetch error:', chainError);
    return null;
  }

  if (!chainState || !chainState.definition_id) return null;

  // Step 2: get the definition separately
  const { data: definition, error: defError } = await supabase
    .from('definitions')
    .select('id, session_id, term, definition_text, citations, language, chain_depth, created_at, embedding')
    .eq('id', chainState.definition_id)
    .single();

  if (defError || !definition) {
    console.error('[chain] getActiveChainContext definition fetch error:', {
      definition_id: chainState.definition_id,
      error: defError,
    });
    return null;
  }

  return {
    chainState: {
      id: chainState.id,
      definition_id: chainState.definition_id,
      is_active: chainState.is_active,
      created_at: chainState.created_at,
    },
    definition: definition as Definition,
  };
}

/**
 * Advances the chain:
 * 1. Deactivates all existing chain_state entries.
 * 2. Creates a new active chain_state pointing at the given definition.
 */
export async function advanceChain(definitionId: string): Promise<void> {
  // Deactivate all existing entries
  const { error: deactivateError } = await supabase
    .from('chain_state')
    .update({ is_active: false })
    .eq('is_active', true);

  if (deactivateError) {
    console.error('[chain] advanceChain deactivate error:', deactivateError);
    // Still attempt to create new entry
  }

  // Insert new active entry
  const { error: insertError } = await supabase.from('chain_state').insert({
    definition_id: definitionId,
    is_active: true,
  });

  if (insertError) {
    console.error('[chain] advanceChain insert error:', insertError);
    throw new Error(`Failed to advance chain: ${insertError.message}`);
  }
}

/**
 * Returns all definitions that have ever been part of the chain,
 * ordered by chain_depth ascending (oldest first).
 */
export async function getChainHistory(): Promise<Definition[]> {
  const { data, error } = await supabase
    .from('definitions')
    .select('id, session_id, term, definition_text, citations, language, chain_depth, created_at, embedding')
    .not('chain_depth', 'is', null)
    .order('chain_depth', { ascending: true });

  if (error) {
    console.error('[chain] getChainHistory error:', error);
    return [];
  }

  return (data ?? []) as Definition[];
}

/**
 * Deactivates all chain_state entries, effectively resetting the chain.
 */
export async function resetChain(): Promise<void> {
  const { error } = await supabase
    .from('chain_state')
    .update({ is_active: false })
    .eq('is_active', true);

  if (error) {
    console.error('[chain] resetChain error:', error);
    throw new Error(`Failed to reset chain: ${error.message}`);
  }
}
