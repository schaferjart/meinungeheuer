/**
 * Split long text into chunks at sentence boundaries.
 * Each chunk targets ~maxWordsPerChunk words but won't break mid-sentence.
 */
export function splitTextIntoChunks(text: string, maxWordsPerChunk: number = 200): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g);

  // If no sentence boundaries found, or text is short enough, return as-is
  if (!sentences) return [text];

  const totalWords = text.split(/\s+/).filter(Boolean).length;
  if (totalWords <= maxWordsPerChunk) return [text];

  const chunks: string[] = [];
  let currentChunk = '';
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = sentence.split(/\s+/).filter(Boolean).length;

    if (currentWordCount + sentenceWordCount > maxWordsPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
      currentWordCount = 0;
    }

    currentChunk += sentence;
    currentWordCount += sentenceWordCount;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}
