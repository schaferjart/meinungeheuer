/**
 * Compute a SHA-256 cache key from stripped text + voice ID.
 */
export async function computeCacheKey(text: string, voiceId: string): Promise<string> {
  const input = text.replace(/\s+/g, ' ').trim() + '|' + voiceId;
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
