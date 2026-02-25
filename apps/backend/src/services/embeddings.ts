import OpenAI from 'openai';
import { supabase } from './supabase.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Generates an embedding for a definition's text and stores it in the database.
 * This function is fire-and-forget — call it without await from webhooks.
 * Never throws; all errors are logged.
 */
export async function generateEmbedding(definitionId: string): Promise<void> {
  try {
    // Fetch the definition text
    const { data: definition, error: fetchError } = await supabase
      .from('definitions')
      .select('id, term, definition_text')
      .eq('id', definitionId)
      .single();

    if (fetchError || !definition) {
      console.error('[embeddings] Failed to fetch definition for embedding:', {
        definitionId,
        error: fetchError,
      });
      return;
    }

    // Build input text: combine term + definition for richer embedding
    const inputText = `${definition.term}: ${definition.definition_text}`;

    const openai = getOpenAIClient();

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: inputText,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const embeddingData = response.data[0];
    if (!embeddingData) {
      console.error('[embeddings] No embedding data returned from OpenAI for:', definitionId);
      return;
    }

    const embedding = embeddingData.embedding;

    // Store the embedding back in the database
    const { error: updateError } = await supabase
      .from('definitions')
      .update({ embedding })
      .eq('id', definitionId);

    if (updateError) {
      console.error('[embeddings] Failed to store embedding:', {
        definitionId,
        error: updateError,
      });
      return;
    }

    console.log('[embeddings] Embedding generated and stored for definition:', definitionId);
  } catch (err) {
    console.error('[embeddings] Unexpected error generating embedding:', {
      definitionId,
      error: err,
    });
  }
}
