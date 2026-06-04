// Field-level scoring for the OCR accuracy harness.
//
// Structured fields (docNumber, expiryISO, country) are scored by EXACT match
// after light normalization. Names are scored by normalized edit distance so a
// near-miss (a dropped diacritic, one garbled letter) is penalized
// proportionally rather than failing outright.
//
// Diacritics are deliberately KEPT when comparing names: the ground truth holds
// the true accented spelling (e.g. "Garção"), so an MRZ-derived ASCII result
// ("Garcao") scores high but below 1.0 — which is exactly the "diacritics must
// survive end to end" signal the task asks for.

export interface Fields {
  firstName: string;
  lastName: string;
  docNumber: string;
  expiryISO: string;
  country: string;
}

export type FieldKey = keyof Fields;

export const STRUCTURED: FieldKey[] = ["docNumber", "expiryISO", "country"];
export const FUZZY: FieldKey[] = ["firstName", "lastName"];

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diag = tmp;
    }
  }
  return prev[n];
}

// Collapse whitespace and lowercase, but keep accented characters.
function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Strip diacritics: "garção" → "garcao". MRZ is ASCII-only, so an MRZ-derived
// name can never carry accents; folding lets us measure operational identity
// (is this the right person?) separately from the stricter "diacritics survived"
// requirement.
function fold(s: string): string {
  return normName(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function sim(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Diacritic-SENSITIVE similarity (1.0 only if accents match too).
export function nameSimilarity(got: string, want: string): number {
  return sim(normName(got), normName(want));
}

// Diacritic-FOLDED similarity (accents ignored) — the operational metric.
export function nameSimilarityFolded(got: string, want: string): number {
  return sim(fold(got), fold(want));
}

function normDocNumber(s: string): string {
  return s.toUpperCase().replace(/[\s<]/g, "");
}

export function structuredMatch(key: FieldKey, got: string, want: string): boolean {
  if (key === "docNumber") return normDocNumber(got) === normDocNumber(want);
  return got.trim() === want.trim();
}

export interface FieldResult {
  key: FieldKey;
  got: string;
  want: string;
  // For structured fields: 1 if exact match else 0. For names: diacritic-
  // sensitive similarity.
  score: number;
  // For names only: diacritic-folded similarity (the operational metric).
  foldedScore?: number;
  // Pass = exact for structured, folded-similarity >= NAME_PASS for names.
  pass: boolean;
}

export const NAME_PASS = 0.85;

export function scoreDocument(got: Fields, want: Fields): FieldResult[] {
  const out: FieldResult[] = [];
  for (const key of STRUCTURED) {
    const ok = structuredMatch(key, got[key], want[key]);
    out.push({ key, got: got[key], want: want[key], score: ok ? 1 : 0, pass: ok });
  }
  for (const key of FUZZY) {
    const score = nameSimilarity(got[key], want[key]);
    const foldedScore = nameSimilarityFolded(got[key], want[key]);
    // Pass on the folded (operational) score; the sensitive score is reported.
    out.push({ key, got: got[key], want: want[key], score, foldedScore, pass: foldedScore >= NAME_PASS });
  }
  return out;
}
