const LEADING_ARTICLE = /^(a|an|the)\s+/;

/**
 * Normalize a player answer for comparison and cache keys.
 * Lowercase, NFKC, strip punctuation, collapse whitespace, drop one leading article.
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEADING_ARTICLE, "")
    .trim();
}
