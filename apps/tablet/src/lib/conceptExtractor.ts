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
  // Articles & determiners
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  // Conjunctions & particles
  'und', 'oder', 'aber', 'denn', 'weil', 'wenn', 'dass', 'als', 'wie', 'so', 'da',
  'sondern', 'obwohl', 'sobald', 'solange', 'nachdem', 'bevor', 'damit', 'indem',
  'wobei', 'sodass', 'falls', 'sofern', 'während',
  // Prepositions
  'in', 'an', 'auf', 'aus', 'bei', 'mit', 'nach', 'von', 'vor', 'zu', 'zum', 'zur',
  'um', 'bis', 'durch', 'für', 'gegen', 'ohne', 'über', 'unter', 'zwischen',
  'entlang', 'innerhalb', 'außerhalb', 'anstatt', 'trotz', 'wegen', 'statt',
  // Pronouns
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mich', 'dich', 'sich', 'uns', 'euch',
  'mein', 'dein', 'sein', 'unser', 'euer',
  'meine', 'deine', 'seine', 'unsere', 'eure', 'ihre',
  'meinem', 'deinem', 'seinem', 'unserem', 'eurem', 'ihrem',
  'meinen', 'deinen', 'seinen', 'unseren', 'euren', 'ihren',
  'meiner', 'deiner', 'seiner', 'unserer', 'eurer', 'ihrer',
  'selbst', 'selber', 'einander',
  // Demonstratives & relatives
  'dieser', 'diese', 'dieses', 'diesem', 'diesen',
  'jener', 'jene', 'jenes', 'jenem', 'jenen',
  'welcher', 'welche', 'welches', 'welchem', 'welchen',
  'derselbe', 'dieselbe', 'dasselbe', 'derjenige', 'diejenige', 'dasjenige',
  // Auxiliary & modal verbs (all forms)
  'ist', 'sind', 'war', 'waren', 'bin', 'bist', 'wird', 'werden', 'wurde', 'wurden',
  'wäre', 'wären', 'würde', 'würden', 'würdest',
  'hat', 'haben', 'hatte', 'hatten', 'habe', 'hast', 'hätte', 'hätten',
  'kann', 'muss', 'soll', 'will', 'darf', 'mag',
  'können', 'müssen', 'sollen', 'wollen', 'dürfen', 'mögen',
  'konnte', 'musste', 'sollte', 'wollte', 'durfte', 'mochte',
  'könnte', 'müsste', 'dürfte', 'möchte', 'möchten',
  // Negation
  'nicht', 'kein', 'keine', 'keinem', 'keinen', 'keiner', 'niemals', 'nirgends',
  // Interrogatives
  'was', 'wer', 'wen', 'wem', 'wessen', 'wo', 'wann', 'warum', 'woher', 'wohin', 'wieso',
  // Common adverbs (the biggest gap — these are NOT concepts)
  'hier', 'dort', 'dann', 'nun', 'noch', 'schon', 'auch', 'nur', 'sehr', 'mehr',
  'immer', 'wieder', 'etwa', 'eigentlich', 'halt', 'gar', 'gerade', 'ganz',
  'man', 'etwas', 'nichts', 'alles', 'viel', 'viele', 'andere', 'anderen', 'anderem',
  'ja', 'nein', 'doch', 'also', 'wohl', 'eben', 'mal', 'genau',
  'irgendwie', 'irgendwo', 'irgendwann', 'irgendwas', 'irgendein',
  'dabei', 'dafür', 'dagegen', 'daher', 'dahin', 'damals', 'damit', 'danach',
  'daneben', 'daran', 'darauf', 'daraus', 'darin', 'darum', 'darunter', 'darüber',
  'davon', 'davor', 'dazu', 'dazwischen',
  'ziemlich', 'wirklich', 'tatsächlich', 'natürlich', 'sicher', 'bestimmt',
  'wahrscheinlich', 'offenbar', 'anscheinend', 'jedenfalls', 'überhaupt',
  'bereits', 'bisher', 'bislang', 'bloß', 'längst', 'sofort', 'sogar',
  'außerdem', 'deshalb', 'deswegen', 'trotzdem', 'dennoch', 'allerdings',
  'hingegen', 'insofern', 'insgesamt', 'insbesondere', 'zumindest', 'mindestens',
  'übrigens', 'schließlich', 'letztlich', 'grundsätzlich', 'gewissermaßen',
  'quasi', 'sozusagen', 'gleichzeitig', 'gleichsam',
  // Common adjectives/adverbs that aren't conceptual
  'groß', 'große', 'großen', 'großer', 'großes', 'größer', 'größte', 'größten',
  'klein', 'kleine', 'kleinen', 'kleiner', 'kleines', 'kleinste',
  'lang', 'lange', 'langen', 'langer', 'langes', 'länger', 'längste',
  'kurz', 'kurze', 'kurzen', 'kurzer', 'kurzes', 'kürzer',
  'gut', 'gute', 'guten', 'guter', 'gutes', 'besser', 'beste', 'besten',
  'schlecht', 'schlechte', 'schlechten', 'schlechter', 'schlechtes',
  'neu', 'neue', 'neuen', 'neuer', 'neues', 'neueste',
  'alt', 'alte', 'alten', 'alter', 'altes', 'älter', 'älteste',
  'erst', 'erste', 'ersten', 'erster', 'erstes',
  'letzt', 'letzte', 'letzten', 'letzter', 'letztes',
  'ander', 'andere', 'anderen', 'anderer', 'anderes', 'anders',
  'gleich', 'gleiche', 'gleichen', 'gleicher', 'gleiches',
  'eigen', 'eigene', 'eigenen', 'eigener', 'eigenes', 'eigentliche', 'eigentlichen',
  'gewiss', 'gewisse', 'gewissen', 'gewisser', 'gewisses',
  'bestimmt', 'bestimmte', 'bestimmten', 'bestimmter', 'bestimmtes',
  'möglich', 'mögliche', 'möglichen', 'möglicher', 'mögliches',
  'verschieden', 'verschiedene', 'verschiedenen', 'verschiedener',
  'wesentlich', 'wesentliche', 'wesentlichen', 'wesentlicher',
  'zentral', 'zentrale', 'zentralen', 'zentraler', 'zentrales',
  // Common verbs (non-conceptual)
  'gibt', 'geben', 'gegeben', 'machen', 'macht', 'gemacht',
  'sagen', 'sagt', 'sagst', 'gesagt', 'gehen', 'geht', 'ging', 'gegangen',
  'kommen', 'kommt', 'kam', 'gekommen',
  'denke', 'denken', 'denkst', 'finde', 'finden', 'findest', 'wissen', 'weiss', 'weiß',
  'nehmen', 'nimmt', 'nimmst', 'genommen',
  'stehen', 'steht', 'stehst', 'gestanden',
  'lassen', 'lässt', 'gelassen', 'halten', 'hält', 'hältst', 'gehalten',
  'bleiben', 'bleibt', 'bleibst', 'geblieben',
  'bringen', 'bringt', 'gebracht',
  'liegen', 'liegt', 'gelegen',
  'sitzen', 'sitzt', 'gesessen',
  'laufen', 'läuft', 'gelaufen',
  'sprechen', 'spricht', 'sprichst', 'gesprochen',
  'heißt', 'heißen', 'bedeutet', 'bedeuten',
  'brauchen', 'braucht', 'brauchst',
  'glauben', 'glaubt', 'glaubst',
  'meinen', 'meint', 'meinst',
  'scheinen', 'scheint', 'erscheint',
  'versuchen', 'versucht', 'versuchst',
  'anfangen', 'fängt', 'angefangen',
  'aufhören', 'hört', 'aufgehört',
  'beginnen', 'beginnt', 'begonnen',
  'enden', 'endet', 'beenden', 'beendet',
  'schauen', 'schaut', 'schauen', 'anschauen',
  'setzen', 'setzt', 'gesetzt',
  'stellen', 'stellt', 'gestellt',
  'legen', 'legt', 'gelegt',
  'ziehen', 'zieht', 'gezogen',
  'führen', 'führt', 'geführt',
  'tragen', 'trägt', 'getragen',
  'fallen', 'fällt', 'gefallen',
  'spielen', 'spielt', 'gespielt',
  'lesen', 'liest', 'gelesen',
  'schreiben', 'schreibt', 'geschrieben',
  'zeigen', 'zeigt', 'gezeigt',
  'erkennen', 'erkennt', 'erkannt',
  'verstehen', 'versteht', 'verstanden',
  'beschreiben', 'beschreibt', 'beschrieben',
  'spüren', 'spürst', 'spürt', 'gespürt',
  'fühlen', 'fühlst', 'fühlt', 'gefühlt',
  'lösen', 'löst', 'gelöst',
  'anhält', 'anhalten', 'angehalten',
  'aussteigen', 'aussteigst', 'ausgestiegen',
  'bestehen', 'besteht', 'bestanden',
  // Filler & discourse markers
  'okay', 'genau', 'stimmt', 'klar', 'richtig', 'falsch',
  'vielleicht', 'eventuell', 'vermutlich',
  'eher', 'fast', 'kaum', 'recht', 'wohl',
  'naja', 'ähm', 'hmm', 'ach', 'oh',
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
