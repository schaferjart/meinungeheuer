/** Add [N] prefix to each paragraph for citation grounding. */
export function addParagraphNumbers(text: string): string {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  if (paragraphs.length === 0) return '';
  return paragraphs.map((p, i) => `[${i + 1}] ${p.trim()}`).join('\n\n');
}
