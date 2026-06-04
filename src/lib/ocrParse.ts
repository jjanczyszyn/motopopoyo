// Parses raw OCR text from a passport, ID card, or driver's license into the
// reservation flow's fields. Three paths, in order of preference:
//
//   1. TD3 MRZ (passports): two 44-char lines starting with "P<".
//   2. TD1 MRZ (ID cards): three 30-char lines, first starts with "I"/"ID".
//      Used by German Personalausweis, Spanish DNI, etc.
//   3. Visual-zone heuristics (driver's licenses + ID cards without a
//      readable MRZ). Reads English/Spanish/German/French labels.
//
// Tesseract regularly garbles "<" → "K"/"&"/"@", drops a few characters, and
// reorders lines. We tolerate all of that.

export interface ParsedDocument {
  firstName: string;
  lastName: string;
  docNumber: string;
  expiryISO: string;
  country: string;
  source: "mrz-td3" | "mrz-td1" | "license" | "partial" | "none";
}

// ---------------------------------------------------------------------------
// Country code maps
// ---------------------------------------------------------------------------

// Standard 3-letter ISO codes used in passport and TD1 MRZs.
const ISO3_TO_NAME: Record<string, string> = {
  USA: "United States",
  CAN: "Canada",
  MEX: "Mexico",
  NIC: "Nicaragua",
  CRI: "Costa Rica",
  PAN: "Panama",
  GTM: "Guatemala",
  SLV: "El Salvador",
  HND: "Honduras",
  GBR: "United Kingdom",
  IRL: "Ireland",
  FRA: "France",
  ESP: "Spain",
  DEU: "Germany",
  // Germany sometimes encodes itself as a single "D" left-padded with "<".
  // We handle "D<<" specially in the MRZ parsers but include "D" here as a
  // safe fallback.
  D:   "Germany",
  NLD: "Netherlands",
  BEL: "Belgium",
  ITA: "Italy",
  CHE: "Switzerland",
  AUT: "Austria",
  PRT: "Portugal",
  DNK: "Denmark",
  SWE: "Sweden",
  NOR: "Norway",
  FIN: "Finland",
  POL: "Poland",
  CZE: "Czech Republic",
  SVK: "Slovakia",
  HUN: "Hungary",
  ROU: "Romania",
  BGR: "Bulgaria",
  HRV: "Croatia",
  SVN: "Slovenia",
  LUX: "Luxembourg",
  ISL: "Iceland",
  EST: "Estonia",
  LVA: "Latvia",
  LTU: "Lithuania",
  GRC: "Greece",
  BRA: "Brazil",
  ARG: "Argentina",
  CHL: "Chile",
  COL: "Colombia",
  PER: "Peru",
  URY: "Uruguay",
  AUS: "Australia",
  NZL: "New Zealand",
  CHN: "China",
  JPN: "Japan",
  KOR: "South Korea",
  IND: "India",
  IDN: "Indonesia",
  SGP: "Singapore",
  THA: "Thailand",
  VNM: "Vietnam",
  PHL: "Philippines",
  ZAF: "South Africa",
  ARE: "UAE",
  SAU: "Saudi Arabia",
};

// Long-form names that may appear in the visual zone, in priority order.
const LONG_NAMES_TO_NAME: Array<[RegExp, string]> = [
  [/united\s*states\s*of\s*america|united\s*states|\bUSA\b|\bU\.S\.A\.\b/i, "United States"],
  [/united\s*kingdom|great\s*britain/i, "United Kingdom"],
  [/canad(?:a|ienne|ian)/i, "Canada"],
  [/mexico/i, "Mexico"],
  [/nicaragua/i, "Nicaragua"],
  [/costa\s*rica/i, "Costa Rica"],
  [/france|francais/i, "France"],
  // "Reino de España" / "ESPAÑA" / "ESPAÑOLA" — handle missing tilde from OCR.
  [/(reino\s+de\s+)?espan[aoñ]|espa(ñ|n)ola|\bESP\b/i, "Spain"],
  [/bundesrepublik\s+deutschland|deutschland|germany|reisepass|personalausweis/i, "Germany"],
  [/italy|italia/i, "Italy"],
  [/netherlands|nederland/i, "Netherlands"],
  [/belgium/i, "Belgium"],
  [/portugal/i, "Portugal"],
  [/australia/i, "Australia"],
  [/brazil|brasil/i, "Brazil"],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) =>
      /^\s+$|^-$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join("");
}

// MRZ uses YYMMDD with a sliding century window. For expiry we always assume
// 2000s — anyone with a passport expiring last century is well past renewal.
function mrzExpiryToISO(yymmdd: string): string {
  if (!/^\d{6}$/.test(yymmdd)) return "";
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = parseInt(yymmdd.slice(2, 4), 10);
  const dd = parseInt(yymmdd.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  const yyyy = 2000 + yy;
  // Validate calendar (rejects 31 Feb etc).
  const date = new Date(yyyy, mm - 1, dd);
  if (date.getFullYear() !== yyyy || date.getMonth() !== mm - 1 || date.getDate() !== dd) {
    return "";
  }
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

// Tesseract sometimes produces "<" as one of these. We don't include `K`
// because it's also a valid letter — names like LUKAS / ANNIKA were getting
// shredded. The remaining substitutions are safe (no language uses « / @ / &
// inside a name).
function normaliseMrzLine(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9<«@&]/g, "")
    .replace(/[«@&]/g, "<");
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + "<".repeat(n - s.length);
}

// Resolve a country code that came out of the MRZ. Strips leading "<"
// fillers (some German passports encode country as "D<<").
function resolveCountry(code: string): string {
  const stripped = code.replace(/<+/g, "");
  if (ISO3_TO_NAME[stripped]) return ISO3_TO_NAME[stripped];
  // OCR digit↔letter confusion inside the code, e.g. "1TA"→"ITA", "DELI"→…
  return ISO3_TO_NAME[lettersFromDigits(stripped)] ?? "";
}

// ---------------------------------------------------------------------------
// ICAO 9303 check digits + OCR-confusion repair
//
// The MRZ carries check digits (mod-10, weights 7-3-1) on the document number,
// date of birth, expiry, and a final composite. They give built-in error
// correction: when Tesseract garbles a character we can detect it (check digit
// no longer matches) and often repair it by trying the handful of glyphs the
// real character is commonly confused with. This is the single biggest
// reliability lever for machine-readable documents and is why we prefer the
// MRZ over the printed visual zone.
// ---------------------------------------------------------------------------

const MRZ_WEIGHTS = [7, 3, 1];

function mrzCharValue(c: string): number {
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55; // A=10 … Z=35
  return 0; // "<" filler and anything else
}

export function mrzCheckDigit(field: string): number {
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    sum += mrzCharValue(field[i]) * MRZ_WEIGHTS[i % 3];
  }
  return sum % 10;
}

// Glyphs Tesseract routinely swaps in MRZ/OCR-B text. Symmetric where it
// matters; only pairs that actually occur (no "K", which is a real letter we
// must not treat as "<").
const CONFUSIONS: Record<string, string[]> = {
  // The rounded OCR-B glyphs 0/O/D/Q/G/B are all mutually confused by Tesseract.
  "0": ["O", "D", "Q", "G", "B"],
  O: ["0", "D", "Q", "G"],
  D: ["0", "O"],
  Q: ["0", "O"],
  G: ["6", "0", "O"],
  B: ["8", "0"],
  "1": ["I", "L", "T"],
  I: ["1", "L", "T"],
  L: ["1", "I"],
  T: ["1", "I", "7"],
  "2": ["Z"],
  Z: ["2"],
  "5": ["S"],
  S: ["5"],
  "8": ["B"],
  "6": ["G"],
  "7": ["T"],
};

// Normalise a country/nationality code by pushing common digit misreads back to
// their letters (codes are always alphabetic), e.g. "1TA"→"ITA", "5WE"→"SWE".
function lettersFromDigits(code: string): string {
  const map: Record<string, string> = { "0": "O", "1": "I", "5": "S", "8": "B", "2": "Z", "6": "G", "7": "T" };
  return code.replace(/[0-9]/g, (d) => map[d] ?? d);
}

// Given an OCR'd field and the expected check character (which may itself be
// misread), return the variant of `field` whose check digit is internally
// consistent — trying up to `maxEdits` confusion substitutions. Returns null
// when nothing reconciles, so callers can fall back to the raw slice.
function repairToCheckDigit(field: string, checkChar: string, maxEdits = 3): string | null {
  const targets = new Set<number>();
  // The check char can be a digit, or a digit misread as a letter ("0"→"O").
  if (/[0-9]/.test(checkChar)) targets.add(parseInt(checkChar, 10));
  const asDigit = lettersFromDigits(checkChar);
  if (/[0-9]/.test(asDigit)) targets.add(parseInt(asDigit, 10));
  if (targets.size === 0) for (let d = 0; d <= 9; d++) targets.add(d); // unknown → accept any

  if (targets.has(mrzCheckDigit(field))) return field;

  // BFS over confusion substitutions, fewest edits first.
  let frontier = [field];
  const seen = new Set([field]);
  for (let edit = 0; edit < maxEdits; edit++) {
    const next: string[] = [];
    for (const cand of frontier) {
      for (let i = 0; i < cand.length; i++) {
        const alts = CONFUSIONS[cand[i]];
        if (!alts) continue;
        for (const a of alts) {
          const repl = cand.slice(0, i) + a + cand.slice(i + 1);
          if (seen.has(repl)) continue;
          seen.add(repl);
          if (targets.has(mrzCheckDigit(repl))) return repl;
          next.push(repl);
        }
      }
    }
    frontier = next;
  }
  return null;
}

// Map a single check-digit character back to a digit, tolerating OCR rendering
// it as a confusable letter (Tesseract emits "0"→"O", "5"→"S", etc.).
const DIGIT_FROM_LETTER: Record<string, string> = {
  O: "0", D: "0", Q: "0", I: "1", L: "1", T: "7", Z: "2", S: "5", B: "8", G: "6",
};
function asCheckDigit(c: string): number | null {
  if (/^[0-9]$/.test(c)) return parseInt(c, 10);
  const d = DIGIT_FROM_LETTER[c];
  return d != null ? parseInt(d, 10) : null;
}

// Is `field`'s own check digit internally consistent? Used to decide whether an
// MRZ is a genuine ICAO document (whose check digits we can trust for repair)
// versus synthetic/garbled text where the check digits are meaningless.
function mrzFieldValid(field: string, checkChar: string): boolean {
  const d = asCheckDigit(checkChar);
  return d != null && mrzCheckDigit(field) === d;
}

// Extract a document number from a 9-char MRZ slot + its check char. Confusion
// repair is only attempted when `trustCheck` is true — i.e. the surrounding MRZ
// has at least one other valid check digit, proving it's a real document with a
// reliable doc-number check digit. Otherwise we return the raw slice, so we
// never "correct" a synthetic or wholly garbled MRZ into a plausible-but-wrong
// number.
function repairDocNumber(slot9: string, checkChar: string, trustCheck: boolean): string {
  const repaired = (trustCheck ? repairToCheckDigit(slot9, checkChar) : null) ?? slot9;
  return repaired.replace(/</g, "").trim();
}

// ---------------------------------------------------------------------------
// TD3 (passport) parser — 2 lines × 44 chars
//
// Real-world tesseract output is messy. Common failures we tolerate:
//   - "P<" prefix on line 1 read as "PS" (S in place of <), breaking strict
//     length/position math
//   - Leading digit of line 2 dropped, shifting all field positions left
//   - "<<" filler between country and surname (Germany's "D<<" code) confused
//     with the surname/given-names "<<" separator
//
// Strategy: scan first chars for a known country code instead of trusting
// the "P<" prefix; anchor line-2 fields on the country-code substring rather
// than fixed offsets.
// ---------------------------------------------------------------------------

// Look for a country code in the first `maxStart` characters of a normalised
// MRZ line. Returns where the 3-char country slot begins. Handles standard
// 3-letter codes and Germany's single-letter "D<<" form.
function findCountryInHead(
  line: string,
  maxStart: number = 6
): { code: string; pos: number } | null {
  for (let i = 0; i <= Math.min(maxStart, line.length - 3); i++) {
    const slot = line.slice(i, i + 3);
    if (slot.length < 3) break;
    if (ISO3_TO_NAME[slot]) return { code: slot, pos: i };
    if (slot === "D<<") return { code: "D", pos: i };
  }
  return null;
}

// Same idea for line 2 — country is at standard position 10 but OCR can
// shift it left by 1-2 positions, so we scan 5..13. Wider than that risks
// matching TD1 line 2's nationality field (position 15) and confusing an
// ID card for a passport.
function findCountryInLine2(line: string): { code: string; pos: number } | null {
  for (let i = 5; i <= Math.min(13, line.length - 3); i++) {
    const slot = line.slice(i, i + 3);
    if (slot.length < 3) break;
    if (ISO3_TO_NAME[slot]) return { code: slot, pos: i };
    if (slot === "D<<") return { code: "D", pos: i }; // German single-letter nationality
    // Digit↔letter confusion in the nationality code, e.g. "1TA"→"ITA".
    const fixed = lettersFromDigits(slot);
    if (fixed !== slot && ISO3_TO_NAME[fixed]) return { code: fixed, pos: i };
  }
  return null;
}

// Does line 2 structurally look like a TD3 second line, even when the
// nationality code is unknown/fictional (e.g. specimen "UTO") or too garbled to
// match? Pattern: 9-char doc-number slot, a check char, a 3-char nationality,
// then a 6-digit DOB. Tolerant of OCR filler-as-letter noise in the doc slot.
function looksLikeTD3Line2(line: string): boolean {
  return /^[A-Z0-9<]{9}[0-9A-Z<][A-Z0-9<]{3}\d{5}/.test(line.slice(0, 24));
}

// How much does this line look like a genuine TD3 second line? Line 2 carries
// every structured field (doc number, nationality, DOB, expiry) plus their
// check digits, so it is far more reliable to anchor on than the OCR-noisy
// line 1. We score candidates by how many check digits validate; the winner's
// preceding "<<" line supplies the names.
function scoreTD3Line2(line: string): number {
  const c2 = findCountryInLine2(line);
  if (!c2 && !looksLikeTD3Line2(line)) return 0;
  const offset = c2 ? c2.pos - 10 : 0;
  if (offset < 0) return 0;
  // A genuine line 2 carries two 6-digit date runs (DOB then expiry) at fixed
  // offsets. When the nationality isn't a recognised country code we demand
  // BOTH date runs — that's what separates a real passport line from a name
  // line with a stray country trigram ("ARENAS"→"ARE") or a non-ICAO machine
  // line (a French driving licence, an ID-card front) that has only one
  // date-shaped run and a coincidentally-valid check digit.
  const dobDigits = /^\d{6}$/.test(line.slice(offset + 13, offset + 19));
  const expDigits = /^\d{6}$/.test(line.slice(offset + 21, offset + 27));
  // Always need at least one date run — rejects a name line that merely
  // contains a country trigram ("ARENAS"→"ARE"/UAE) but no dates.
  if (!dobDigits && !expDigits) return 0;
  // Without a recognised country, demand BOTH date runs — rejects non-ICAO
  // machine lines (French DL, ID-card fronts) that have one date-shaped run
  // and a coincidentally-valid check digit.
  if (!c2 && !(dobDigits && expDigits)) return 0;
  const docV = mrzFieldValid(line.slice(offset, offset + 9), line.slice(offset + 9, offset + 10));
  const dobV = mrzFieldValid(line.slice(offset + 13, offset + 19), line.slice(offset + 19, offset + 20));
  const expV = mrzFieldValid(line.slice(offset + 21, offset + 27), line.slice(offset + 27, offset + 28));
  return (c2 ? 3 : 0) + (dobDigits ? 1 : 0) + (expDigits ? 1 : 0) +
    (docV ? 2 : 0) + (dobV ? 2 : 0) + (expV ? 2 : 0);
}

function findTD3Pair(text: string): [string, string] | null {
  const lines = text
    .split(/\r?\n/)
    .map(normaliseMrzLine)
    .filter((l) => l.length >= 20);

  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const s = scoreTD3Line2(lines[i]);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  // Minimum confidence to declare a TD3 line 2. A recognised nationality scores
  // 3 on its own; a fictional/garbled nationality needs corroborating valid
  // check digits to reach the bar. This keeps driver's licences and ID-card
  // fronts (which have date-shaped digit runs but no country and no valid check
  // digits) out of the MRZ path so they fall through to the visual zone.
  if (bestScore < 3) return null;

  // Line 1 (names): the nearest preceding line carrying a "<<" separator,
  // falling back to the immediately preceding line.
  let line1 = bestIdx > 0 ? lines[bestIdx - 1] : "";
  for (let j = bestIdx - 1; j >= Math.max(0, bestIdx - 2); j--) {
    if (lines[j].includes("<<")) { line1 = lines[j]; break; }
  }
  return [pad(line1, 44), pad(lines[bestIdx], 44)];
}

function parseTD3(text: string): ParsedDocument | null {
  const pair = findTD3Pair(text);
  if (!pair) return null;
  const [line1, line2] = pair;

  // Country from line 1 if we can read it there, else (line 1 too garbled to
  // locate the code) we fall back to the line-2 nationality below.
  const detected = findCountryInHead(line1, 6);
  let country = detected ? ISO3_TO_NAME[detected.code] ?? "" : "";

  // Surname starts after the 3-char country slot. When line 1's country is
  // unreadable, assume the standard "P<XXX" 5-char prefix so we can still split
  // names on the "<<" separator.
  const surnameStart = detected ? detected.pos + 3 : 5;
  const sepRel = line1.slice(surnameStart).indexOf("<<");
  let lastName = "";
  let firstName = "";
  if (sepRel >= 0) {
    const sepIdx = surnameStart + sepRel;
    lastName = line1.slice(surnameStart, sepIdx).replace(/</g, " ").trim();
    firstName = line1.slice(sepIdx + 2).replace(/</g, " ").trim();
  }

  // Line 2 — anchor on the country code so OCR shifts (dropped leading
  // digits etc.) don't break field offsets. When the nationality is unknown
  // (fictional "UTO", or too garbled to look up) fall back to the standard
  // offset 0. The 9-char doc-number slot and its check digit are reconciled via
  // confusion repair so single-char OCR errors (0↔O, I↔1, D↔0) are corrected.
  let docNumber = "";
  let expiryISO = "";
  const c2 = findCountryInLine2(line2);
  const offset = c2 ? c2.pos - 10 : 0;
  if (c2 && !country) country = ISO3_TO_NAME[c2.code] ?? "";
  const docStart = Math.max(0, offset);
  const docSlot = line2.slice(docStart, docStart + 9);
  const docCheck = line2.slice(docStart + 9, docStart + 10);
  expiryISO = mrzExpiryToISO(line2.slice(offset + 21, offset + 27));
  // Trust the doc-number check digit only if the DOB or expiry check validates,
  // i.e. this is a genuine ICAO MRZ rather than synthetic/garbled text.
  const dobValid = mrzFieldValid(line2.slice(offset + 13, offset + 19), line2.slice(offset + 19, offset + 20));
  const expValid = mrzFieldValid(line2.slice(offset + 21, offset + 27), line2.slice(offset + 27, offset + 28));
  docNumber = repairDocNumber(docSlot, docCheck, dobValid && expValid);

  if (!docNumber && !expiryISO && !lastName) return null;

  // Customer-facing first name = first given-name token. Multi-given-name
  // documents (US passports often have two, Spanish ones often have a
  // composite "Maria Carmen") would otherwise show up as the full string.
  const firstNameOne = firstName ? firstName.split(/\s+/)[0] : "";

  return {
    firstName: firstNameOne ? titleCase(firstNameOne) : "",
    lastName: lastName ? titleCase(lastName) : "",
    docNumber,
    expiryISO,
    country,
    source: "mrz-td3",
  };
}

// ---------------------------------------------------------------------------
// TD1 (ID card) parser — 3 lines × 30 chars
//   line 1: type(2)+country(3)+docNumber(9)+check(1)+optional(15)
//   line 2: DOB(6)+check(1)+sex(1)+expiry(6)+check(1)+nationality(3)+optional(11)+composite(1)
//   line 3: SURNAME<<GIVEN<NAMES<<<...  (30)
// ---------------------------------------------------------------------------

function findTD1Triple(text: string): [string, string, string] | null {
  const lines = text
    .split(/\r?\n/)
    .map(normaliseMrzLine)
    .filter((l) => l.length >= 24);

  // We need three consecutive plausible TD1 lines. Heuristics:
  //   line 1: starts with I, A, or C; mostly letters/digits/<
  //   line 2: DOB(6) + check + sex + expiry(6) → two 6-digit runs near the start
  //   line 3: the name line — letters plus "<" fillers. We do NOT require "<<"
  //           because Tesseract often renders the "<<" separator as "<K<"
  //           (K is a real letter we deliberately don't fold into "<").
  for (let i = 0; i < lines.length - 2; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    const c = lines[i + 2];
    if (!/^[IAC][A-Z<]/.test(a)) continue;
    if (!/^\d{6}[0-9A-Z<]{1,2}\d{5}/.test(b)) continue;
    if (!(c.includes("<") && (c.match(/[A-Z]/g)?.length ?? 0) >= 4)) continue;
    return [pad(a, 30), pad(b, 30), pad(c, 30)];
  }
  return null;
}

// Cross-reference the visual zone for a passport number when the MRZ-derived
// number looks short. Real passports have 9 digits/alphanumerics; the MRZ
// slot carries 9 chars + 1 check digit but tesseract sometimes drops the
// leading char.
function findVisualPassportNumber(text: string): string {
  // Country code adjacent to a 8-9 digit run, e.g. printed as "USA NNNNNNNNN".
  const m = text.match(/\b(USA|CAN|DEU|ESP|GBR|FRA|MEX|AUS|NLD|ITA)[\s.:,]+(\d{8,9})\b/i);
  if (m) return m[2];
  // Labelled visual zones: "Passport No.: …" / "N° du Passeport: …" /
  // "Pasaporte n.: …" / "Reisepass-Nr.: …".
  const m2 = text.match(/(?:Passport\s*No\.?|N°?\s*du\s*Passeport|Pasaporte\s*n\.?|Reisepass-?Nr\.?)[\s:.]*([A-Z0-9]{6,9})/i);
  if (m2) return m2[1].toUpperCase();
  return "";
}

function parseTD1(text: string): ParsedDocument | null {
  const triple = findTD1Triple(text);
  if (!triple) return null;
  const [line1, line2, line3] = triple;

  // Country at chars 2..5 (might be "D<<" for older German cards).
  const country = resolveCountry(line1.slice(2, 5));

  // Expiry at chars 8..14 of line 2 (YYMMDD).
  const expiryISO = mrzExpiryToISO(line2.slice(8, 14));

  // Document number at chars 5..14 (9-char slot) + check digit at 14. Trust the
  // check digit for repair only when the DOB or expiry check (line 2) validates.
  const dobValid = mrzFieldValid(line2.slice(0, 6), line2.slice(6, 7));
  const expValid = mrzFieldValid(line2.slice(8, 14), line2.slice(14, 15));
  const docNumber = repairDocNumber(line1.slice(5, 14), line1.slice(14, 15), dobValid && expValid);

  // Names on line 3. Primary path splits on the "<<" surname/given separator.
  // Fallback (when OCR ate the separator into "<K<" so no "<<" survives): split
  // on runs of "<", take the first token as surname and the next ≥2-char token
  // as the given name, skipping single-char noise tokens.
  const names = line3.replace(/<+$/, "");
  const sepIdx = names.indexOf("<<");
  let lastName = "";
  let firstName = "";
  if (sepIdx > 0) {
    lastName = names.slice(0, sepIdx).replace(/</g, " ").trim();
    firstName = names.slice(sepIdx + 2).replace(/</g, " ").trim();
  } else {
    const tokens = names.split(/<+/).filter((t) => t.length > 0);
    if (tokens.length > 0) lastName = tokens[0];
    const given = tokens.slice(1).find((t) => t.length >= 2);
    if (given) firstName = given;
  }

  if (!docNumber && !expiryISO && !lastName) return null;

  const firstNameOne = firstName ? firstName.split(/\s+/)[0] : "";

  return {
    firstName: firstNameOne ? titleCase(firstNameOne) : "",
    lastName: lastName ? titleCase(lastName) : "",
    docNumber,
    expiryISO,
    country,
    source: "mrz-td1",
  };
}

// ---------------------------------------------------------------------------
// Visual-zone heuristics (no readable MRZ)
// ---------------------------------------------------------------------------

function detectCountry(text: string): string {
  for (const [pat, name] of LONG_NAMES_TO_NAME) {
    if (pat.test(text)) return name;
  }
  // Fallback: any standalone ISO3 code that we recognise.
  const tokens = text.match(/\b[A-Z]{3}\b/g);
  if (tokens) {
    for (const t of tokens) {
      if (ISO3_TO_NAME[t]) return ISO3_TO_NAME[t];
    }
  }
  return "";
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  // German month abbreviations (common on Personalausweis/Reisepass).
  MAI: 5, OKT: 10, DEZ: 12,
  // Spanish abbreviations (less common on documents but seen).
  ENE: 1, ABR: 4, AGO: 8,
  // Canadian-French.
  FEV: 2, AVR: 4,
};

// Build an ISO date from three numeric/textual parts. Validates the calendar.
function buildISODate(yyyy: number, mm: number, dd: number): string {
  if (!yyyy || !mm || !dd || mm > 12 || dd > 31) return "";
  // Reject implausible years (OCR garbage like a 3-digit "203"). Documents in
  // scope carry dates of birth back to the early 1900s and expiries out a
  // couple of decades; anything outside that is noise.
  if (yyyy < 1900 || yyyy > 2100) return "";
  const date = new Date(yyyy, mm - 1, dd);
  if (date.getFullYear() !== yyyy || date.getMonth() !== mm - 1 || date.getDate() !== dd) {
    return "";
  }
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

// Best-effort: assumes US-style MM/DD/YYYY when both first two are numeric and
// the value is unambiguous. Accepts "JUN" / "MAI" in the month slot. For pure
// numeric DD MM YYYY we also try a swap if MM > 12 → DD/MM.
function partsToISO(a: string, b: string, c: string, prefer: "mdy" | "dmy" = "mdy"): string {
  let yyyy = parseInt(c, 10);
  if (yyyy < 100) yyyy = 2000 + yyyy;
  if (/^[A-Z]{3}$/i.test(a)) {
    const mm = MONTHS[a.toUpperCase()] ?? 0;
    return buildISODate(yyyy, mm, parseInt(b, 10));
  }
  if (/^[A-Z]{3}$/i.test(b)) {
    const mm = MONTHS[b.toUpperCase()] ?? 0;
    return buildISODate(yyyy, mm, parseInt(a, 10));
  }
  let mm = parseInt(prefer === "mdy" ? a : b, 10);
  let dd = parseInt(prefer === "mdy" ? b : a, 10);
  if (mm > 12 && dd <= 12) [mm, dd] = [dd, mm];
  return buildISODate(yyyy, mm, dd);
}

// Pull an expiry out of free-form text. Knows about expiry labels in EN, ES,
// DE, FR. Date-format preference (US MDY vs ROW DMY) follows the country we
// can detect; defaults to US-friendly MDY for ambiguous numeric pairs because
// the US is the only one of our four target countries that uses that order.
function parseExpiry(text: string, prefer: "mdy" | "dmy"): string {
  // Look near an expiry label first so we don't grab DOB or issue date.
  const labels =
    /(?:EXP(?:IRES|IRY|IRATION)?|DATE\s+OF\s+EXPI(?:RY|RATION)|DATE\s+D'?EXPIRATION|FECHA\s+DE\s+CADUCIDAD|G[UÜ]LTIG\s+BIS|VALABLE\s+JUSQU)/i;
  const labelMatch = text.match(labels);
  if (labelMatch && labelMatch.index != null) {
    const window = text.slice(labelMatch.index, labelMatch.index + 80);
    // YYYY-first formats (Canada / ISO) take priority — otherwise a regex
    // hunting for "DD/MM" can lock onto the inner three groups of
    // "2030/07/21" and produce 2021-07-30.
    const yMd = window.match(/(20\d{2})[.\/\-\s]+(\d{1,2})[.\/\-\s]+(\d{1,2})/);
    if (yMd) {
      const iso = buildISODate(parseInt(yMd[1], 10), parseInt(yMd[2], 10), parseInt(yMd[3], 10));
      if (iso) return iso;
    }
    const dot = window.match(/(\d{1,2})[.\/\-\s]+(\d{1,2}|[A-Z]{3})[.\/\-\s]+(\d{2,4})/i);
    if (dot) {
      const iso = partsToISO(dot[1], dot[2], dot[3], prefer);
      if (iso) return iso;
    }
  }

  // ISO-style YYYY-MM-DD anywhere.
  const iso = text.match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/);
  if (iso) {
    const built = buildISODate(parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10));
    if (built) return built;
  }

  // "14 JUN 2030" or "14 MAI 2030" etc.
  const verbose = text.match(/\b(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\b/i);
  if (verbose) {
    const built = partsToISO(verbose[1], verbose[2], verbose[3], prefer);
    if (built) return built;
  }

  // Generic numeric fallback — pick the LAST numeric date in the text, which
  // tends to be the expiry on visual zones (DOB → issue → expiry order).
  const all = [...text.matchAll(/\b(\d{1,2})[\/.\- ](\d{1,2}|[A-Z]{3})[\/.\- ](20\d{2})\b/gi)];
  if (all.length > 0) {
    const last = all[all.length - 1];
    const built = partsToISO(last[1], last[2], last[3], prefer);
    if (built) return built;
  }

  return "";
}

// Strip diacritics so "Naumánn"/"Vornámen" still match plain-ASCII labels.
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Try to read a labelled name field. Looks first for inline labels
// ("LN ALEX ..."), then for a label on its own line followed by the value
// on the next line ("Apellidos\nGUTIERREZ ARENAS").
//
// On a noisy photo the same label can appear more than once — a garbled
// "FN NN" line and the real "$ FN JUSTYNA" line. So we collect every candidate
// (tolerating leading noise before the label) and return the most name-like one
// (most alphabetic characters) rather than the first.
function readLabelledLine(lines: string[], labelPattern: RegExp): string {
  const candidates: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const stripped = stripDiacritics(lines[i]).replace(/^[^A-Za-z]+/, "");
    const m = stripped.match(labelPattern);
    if (!m) continue;
    const after = stripped.slice(m[0].length).replace(/^[\s:.\/]+/, "").trim();
    const inline = after.replace(/[^A-Za-z'\- ]/g, "").trim();
    if (inline.length >= 2) {
      candidates.push(inline);
      continue;
    }
    // Value on the next non-empty line.
    for (let j = i + 1; j < lines.length; j++) {
      const next = stripDiacritics(lines[j]).replace(/[^A-Za-z'\- ]/g, "").trim();
      if (next.length >= 2) {
        candidates.push(next);
        break;
      }
    }
  }
  if (candidates.length === 0) return "";
  const alpha = (s: string) => s.replace(/[^A-Za-z]/g, "").length;
  return candidates.reduce((best, c) => (alpha(c) > alpha(best) ? c : best));
}

interface VisualZoneOptions {
  prefer: "mdy" | "dmy";
}

// US/Canada driver licences encode their data with AAMVA element IDs (DD =
// document discriminator, DCS = surname, DAC = first name, DBA = expiry …) and
// print other label codes. None of these are the user-facing document number,
// yet their long alphanumeric runs (especially the discriminator) are exactly
// what a naive "longest token" heuristic would grab. Reject them.
function isAamvaNoise(t: string): boolean {
  if (/^(DD|DCS|DAC|DCT|DAQ|DCF|DCG|DCA|DCB|DCD|ICN)/.test(t)) return true;
  return /^(USA|CAN|DEU|ESP|FRA|GBR|EXP|DOB|ISS|SEX|HGT|WGT|EYES|HAIR|MALE|FEMALE|CLASS|REAL|LIMITED|TERM|VETERAN|DONOR)$/.test(t);
}

function parseVisualZone(text: string, opts: VisualZoneOptions): ParsedDocument {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // ---- Document number ------------------------------------------------
  // 1) US/CA driver-license style "DL <number>" / "Permis de conduire"
  // 2) Spanish DNI (8 digits + 1 letter) — distinct enough we always prefer it
  // 3) German Reisepass-Nr. / Dokumentennummer label
  // 4) Generic longest token containing letters AND digits as a fallback
  let docNumber = "";
  // Spanish DNI takes priority because the MRZ would carry the support-number
  // and we want the user-facing one.
  const dni = text.match(/\b(\d{8}[A-Z])\b/);
  if (dni) docNumber = dni[1];
  if (!docNumber) {
    for (const l of lines) {
      const stripped = stripDiacritics(l);
      const labelled = stripped.match(
        /(?:DL|ID|LIC(?:ENSE|ENCE)?\s*(?:NO|NUM|#)?|D\.L\.|DOKUMENTEN-?NUMMER|REISEPASS-?NR|PASSPORT\s*NO|PASAPORTE\s*N[O°]?|N[°O]\s*DE?\s*PASSEPORT|DNI)[\s:.#\/]*([A-Z]?\d[A-Z0-9]{4,9})\b/i
      );
      // Guard against AAMVA field codes (DD = document discriminator, etc.)
      // masquerading as a labelled number.
      if (labelled && !isAamvaNoise(labelled[1].toUpperCase())) {
        docNumber = labelled[1].toUpperCase();
        break;
      }
    }
  }
  // US/Canadian driver-licence numbers are 1 letter + 6–8 digits (e.g.
  // "Y6412786"); prefer that distinct shape anywhere in the text.
  if (!docNumber) {
    const usDL = stripDiacritics(text).toUpperCase().match(/\b([A-Z]\d{6,8})\b/);
    if (usDL && !isAamvaNoise(usDL[1])) docNumber = usDL[1];
  }
  // Conservative last resort: a single plausible alphanumeric ID token (5–10
  // chars, mixes letters+digits OR a 6–10 digit run), never the longest random
  // string. We DELIBERATELY leave it blank rather than emit a wrong number — a
  // blank field the user fills beats a confident-but-wrong document number.
  if (!docNumber) {
    const upper = stripDiacritics(text).toUpperCase();
    const tokens = (upper.match(/[A-Z0-9]{5,10}/g) ?? []).filter(
      (t) =>
        !isAamvaNoise(t) &&
        !/^(19|20)\d{2}$/.test(t) && // not a year
        ((/[A-Z]/.test(t) && /\d/.test(t)) || /^\d{6,10}$/.test(t))
    );
    // Only auto-fill if exactly one distinct candidate survives — ambiguity
    // means we can't trust it, so leave it for manual entry.
    const distinct = [...new Set(tokens)];
    if (distinct.length === 1) docNumber = distinct[0];
  }

  // ---- Names ----------------------------------------------------------
  // Last name labels: LN, LAST NAME, SURNAME, APELLIDOS, FAMILIENNAME, NOM
  // First name labels: FN, FIRST NAME, GIVEN NAMES, NOMBRE, VORNAMEN, PRENOMS
  const lastLabel =
    /^(?:LN|LAST\s*NAME|SURNAME|APELLIDOS?(?:\s*\/\s*\w+)?|FAMILIENNAME(?:\s*\/\s*\w+)?|NOM(?:\s*\/\s*\w+)?|PRIMER\s+APELLIDO)\b/i;
  const firstLabel =
    /^(?:FN|FIRST\s*NAME|GIVEN\s*NAMES?(?:\s*\/\s*\w+)?|NOMBRES?(?:\s*\/\s*\w+)?|VORNAMEN?(?:\s*\/\s*\w+)?|PRENOMS?(?:\s*\/\s*\w+)?)\b/i;

  let lastName = readLabelledLine(lines, lastLabel);
  let firstName = readLabelledLine(lines, firstLabel);

  // Spanish DNI splits "PRIMER APELLIDO" / "SEGUNDO APELLIDO" — append the
  // second surname to the first if present.
  for (let i = 0; i < lines.length; i++) {
    if (/^SEGUNDO\s+APELLIDO/i.test(stripDiacritics(lines[i]))) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = stripDiacritics(lines[j]).replace(/[^A-Za-z'\- ]/g, "").trim();
        if (next.length >= 2) {
          if (lastName) lastName = `${lastName} ${next}`;
          else lastName = next;
          break;
        }
      }
    }
  }

  // Trim multi-given-names down to the first one (Karen needs to know what
  // to call them, not their full birth name).
  if (firstName) firstName = firstName.split(/\s+/)[0];

  // Last fallback: a clean line of two or more uppercase words (e.g. a passport
  // visual zone printing "SURNAME GIVEN"). Skip label lines (FN/LN/DOB/…) and
  // anything with digits or punctuation, so a noisy "FN NN 2, :" line is never
  // mistaken for a name — better to leave the field blank for manual entry.
  if (!firstName || !lastName) {
    const isLabel = /^(?:FN|LN|DL|ID|DOB|EXP|ISS|SEX|HGT|WGT|DD|DC[A-Z]|CLASS|REAL|USA|CAN)\b/;
    const candidate = lines
      .map((l) => stripDiacritics(l).trim())
      .find(
        (l) =>
          /^[A-Z][A-Z'-]+\s+[A-Z][A-Z'-]+$/.test(l) && // exactly clean uppercase words
          !isLabel.test(l)
      );
    if (candidate) {
      const parts = candidate.split(/\s+/);
      if (!firstName) firstName = parts[0];
      if (!lastName) lastName = parts.slice(1).join(" ");
    }
  }

  return {
    firstName: firstName ? titleCase(firstName) : "",
    lastName: lastName ? titleCase(lastName) : "",
    docNumber,
    expiryISO: parseExpiry(text, opts.prefer),
    country: detectCountry(text),
    source: "license",
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

// MRZ parsers, in preference order. Returns null when no machine-readable zone
// is found. Scans the whole text, so passing the MRZ pass + visual pass
// concatenated is fine here.
function tryMrz(text: string): ParsedDocument | null {
  const td3 = parseTD3(text);
  if (td3) {
    // If the MRZ-derived doc number is short (8 digits where most passports
    // carry 9), see if the visual zone has the full number and prefer it.
    if (td3.docNumber && /^\d{7,8}$/.test(td3.docNumber)) {
      const visual = findVisualPassportNumber(text);
      if (visual && visual.length > td3.docNumber.length) td3.docNumber = visual;
    }
    return td3;
  }
  const td1 = parseTD1(text);
  if (td1) {
    // For Spanish DNI: visual zone has the user-facing DNI (8 digits + letter)
    // while the MRZ carries the bureaucratic "support number". Prefer the DNI.
    if (td1.country === "Spain") {
      const dni = text.match(/\b(\d{8}[A-Z])\b/);
      if (dni) td1.docNumber = dni[1];
    }
    return td1;
  }
  return null;
}

function parseVisual(text: string): ParsedDocument {
  const country = detectCountry(text);
  const prefer: "mdy" | "dmy" = country === "United States" ? "mdy" : "dmy";
  const lic = parseVisualZone(text, { prefer });
  if (lic.firstName || lic.docNumber || lic.expiryISO) return lic;
  return { ...lic, source: "partial" };
}

const EMPTY: ParsedDocument = {
  firstName: "", lastName: "", docNumber: "", expiryISO: "", country: "", source: "none",
};

export function parseDocumentText(text: string): ParsedDocument {
  if (!text || !text.trim()) return EMPTY;
  return tryMrz(text) ?? parseVisual(text);
}

// Two-pass variant used by the live engine (src/lib/ocrEngine.ts): the MRZ band
// is OCR'd with the OCR-B model, the visual zone with stock English. We look for
// an MRZ across both, but when there is none (driver licences, ID-card fronts)
// we run the visual parser on the VISUAL text ONLY — the OCR-B band over a
// non-MRZ card is pure noise (e.g. it turns a US licence's barcode strip into a
// long fake "document number"), so it must not feed the visual heuristics.
export function parseDocumentSplit(mrzText: string, visualText: string): ParsedDocument {
  const combined = `${mrzText}\n${visualText}`.trim();
  if (!combined) return EMPTY;
  return tryMrz(combined) ?? parseVisual(visualText);
}
