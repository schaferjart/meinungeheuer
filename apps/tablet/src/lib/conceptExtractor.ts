/**
 * Client-side concept/keyword extraction from transcript text.
 * Lightweight approach: stopword filtering + length threshold.
 * Bilingual (German + English) stopword lists.
 */

export interface ConceptExtractionResult {
  concepts: Array<{ normalized: string; display: string }>;
  rawText: string;
}

// Common stopwords for English and German
const STOPWORDS_EN = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'in', 'on', 'at', 'to', 'of', 'by', 'up', 'out', 'off', 'from',
  'with', 'into', 'over', 'after', 'before', 'between', 'under',
  'about', 'above', 'below', 'through', 'during', 'against',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing', 'done',
  'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
  'i', 'me', 'my', 'mine', 'myself',
  'you', 'your', 'yours', 'yourself',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'they', 'them', 'their', 'theirs', 'themselves',
  'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'whom', 'whose',
  'where', 'when', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'not', 'only', 'own', 'same',
  'than', 'too', 'very', 'just', 'also', 'then', 'now',
  'here', 'there', 'again', 'once', 'still',
  'well', 'back', 'even', 'also', 'much', 'many',
  'like', 'think', 'know', 'want', 'tell', 'mean', 'really',
  'thing', 'things', 'something', 'anything', 'everything', 'nothing',
  'said', 'says', 'say', 'going', 'come', 'came', 'goes', 'went',
  'make', 'made', 'take', 'took', 'give', 'gave', 'get', 'got',
  'see', 'seen', 'look', 'good', 'right', 'way',
  'need', 'because', 'okay', 'yeah', 'yes', 'sure',
]);

const STOPWORDS_DE = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  'und', 'oder', 'aber', 'denn', 'weil', 'wenn', 'dass', 'als', 'wie', 'so', 'da',
  'in', 'an', 'auf', 'aus', 'bei', 'mit', 'nach', 'von', 'vor', 'zu', 'zum', 'zur',
  'um', 'bis', 'durch', 'für', 'gegen', 'ohne', 'über', 'unter', 'zwischen',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mich', 'dich', 'sich', 'uns', 'euch',
  'mein', 'dein', 'sein', 'unser', 'euer',
  'meine', 'deine', 'seine', 'unsere', 'eure', 'ihre',
  'meinem', 'deinem', 'seinem', 'unserem', 'eurem', 'ihrem',
  'meinen', 'deinen', 'seinen', 'unseren', 'euren', 'ihren',
  'meiner', 'deiner', 'seiner', 'unserer', 'eurer', 'ihrer',
  'ist', 'sind', 'war', 'waren', 'bin', 'bist', 'wird', 'werden', 'wurde', 'wurden',
  'hat', 'haben', 'hatte', 'hatten', 'habe', 'hast',
  'kann', 'muss', 'soll', 'will', 'darf', 'mag',
  'können', 'müssen', 'sollen', 'wollen', 'dürfen', 'mögen',
  'konnte', 'musste', 'sollte', 'wollte', 'durfte', 'mochte',
  'nicht', 'kein', 'keine', 'keinem', 'keinen', 'keiner',
  'was', 'wer', 'wen', 'wem', 'wessen', 'wo', 'wann', 'warum', 'woher', 'wohin',
  'dieser', 'diese', 'dieses', 'diesem', 'diesen',
  'jener', 'jene', 'jenes', 'jenem', 'jenen',
  'hier', 'dort', 'dann', 'nun', 'noch', 'schon', 'auch', 'nur', 'sehr', 'mehr',
  'man', 'etwas', 'nichts', 'alles', 'viel', 'viele', 'andere', 'anderen', 'anderem',
  'ja', 'nein', 'doch', 'also', 'wohl', 'eben', 'mal', 'ganz', 'gerade',
  'immer', 'wieder', 'etwa', 'eigentlich', 'halt', 'gar',
  'gibt', 'gibt', 'geben', 'machen', 'macht', 'gemacht',
  'sagen', 'sagt', 'gesagt', 'gehen', 'geht', 'ging', 'gegangen',
  'kommen', 'kommt', 'kam', 'gekommen',
  'denke', 'denken', 'finde', 'finden', 'wissen', 'weiss',
]);

// Combine both stopword sets
const STOPWORDS = new Set([...STOPWORDS_EN, ...STOPWORDS_DE]);

// Min word length to consider as a concept
const MIN_WORD_LENGTH = 4;

/**
 * Extract concepts/keywords from a text string.
 * Uses stopword filtering and length thresholds.
 * Works for both English and German text.
 */
export function extractConcepts(text: string): ConceptExtractionResult {
  if (!text || !text.trim()) {
    return { concepts: [], rawText: text ?? '' };
  }

  // Remove punctuation but preserve word boundaries
  const cleaned = text.replace(/[.,!?;:'"()\[\]{}<>\/\\@#$%^&*+=~`|_\-—–]/g, ' ');

  // Split into words
  const words = cleaned.split(/\s+/).filter(Boolean);

  // Track seen normalized forms for deduplication
  const seen = new Set<string>();
  const concepts: Array<{ normalized: string; display: string }> = [];

  for (const word of words) {
    const normalized = word.toLowerCase();

    // Skip short words
    if (normalized.length < MIN_WORD_LENGTH) continue;

    // Skip stopwords
    if (STOPWORDS.has(normalized)) continue;

    // Skip pure numbers
    if (/^\d+$/.test(normalized)) continue;

    // Deduplicate by normalized form
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    concepts.push({ normalized, display: word });
  }

  return { concepts, rawText: text };
}
