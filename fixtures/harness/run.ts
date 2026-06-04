// Accuracy harness runner: reads cached OCR text (fixtures/ocr-cache/<profile>),
// runs the real parser (src/lib/ocrParse.ts), scores every field against
// ground_truth.json, and builds per-document + aggregate tables.
//
// Pure/deterministic: no OCR here (that's recognize.mjs). Importable by the
// vitest accuracy test and runnable for the printed report.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocumentSplit } from "../../src/lib/ocrParse";
import {
  scoreDocument, Fields, FieldResult, STRUCTURED, FUZZY, NAME_PASS, FieldKey,
} from "./score";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..");

export interface GroundTruthDoc {
  image: string;
  type: string;
  mrz: "td3" | "td1" | "none";
  country_code: string;
  notes: string;
  fields: Fields;
}

export function loadGroundTruth(): GroundTruthDoc[] {
  const gt = JSON.parse(readFileSync(join(FIXTURES, "ground_truth.json"), "utf8"));
  return gt.documents;
}

export interface DocReport {
  image: string;
  mrz: string;
  results: FieldResult[];
  parsedSource: string;
}

export function runProfile(profile: string): DocReport[] {
  const docs = loadGroundTruth();
  const cacheDir = join(FIXTURES, "ocr-cache", profile);
  return docs.map((doc) => {
    const cachePath = join(cacheDir, `${doc.image}.txt`);
    if (!existsSync(cachePath)) {
      throw new Error(
        `Missing OCR cache for ${doc.image} (profile "${profile}"). ` +
          `Run: node fixtures/harness/recognize.mjs ${profile}`
      );
    }
    const text = readFileSync(cachePath, "utf8");
    // Cache format: "<MRZ pass>\n===VISUAL===\n<visual pass>". Older single-pass
    // caches (no marker) are treated as all-visual.
    const [mrzText, visualText] = text.includes("===VISUAL===")
      ? (text.split("===VISUAL===") as [string, string])
      : ["", text];
    const parsed = parseDocumentSplit(mrzText, visualText);
    const got: Fields = {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      docNumber: parsed.docNumber,
      expiryISO: parsed.expiryISO,
      country: parsed.country,
    };
    return {
      image: doc.image,
      mrz: doc.mrz,
      results: scoreDocument(got, doc.fields),
      parsedSource: parsed.source,
    };
  });
}

// ---- Aggregation --------------------------------------------------------

export interface Aggregate {
  byField: Record<FieldKey, { passed: number; total: number; rate: number; avgScore: number; avgFolded: number }>;
  docNumberRate: number;
  expiryRate: number;
  countryRate: number;
  nameAvg: number; // diacritic-sensitive
  nameAvgFolded: number; // diacritic-folded (operational gate)
}

export function aggregate(reports: DocReport[]): Aggregate {
  const keys: FieldKey[] = [...STRUCTURED, ...FUZZY];
  const byField = {} as Aggregate["byField"];
  for (const key of keys) {
    const cells = reports.map((r) => r.results.find((x) => x.key === key)!);
    const passed = cells.filter((c) => c.pass).length;
    const n = cells.length || 1;
    const avgScore = cells.reduce((s, c) => s + c.score, 0) / n;
    const avgFolded = cells.reduce((s, c) => s + (c.foldedScore ?? c.score), 0) / n;
    byField[key] = { passed, total: cells.length, rate: passed / n, avgScore, avgFolded };
  }
  return {
    byField,
    docNumberRate: byField.docNumber.rate,
    expiryRate: byField.expiryISO.rate,
    countryRate: byField.country.rate,
    nameAvg: (byField.firstName.avgScore + byField.lastName.avgScore) / 2,
    nameAvgFolded: (byField.firstName.avgFolded + byField.lastName.avgFolded) / 2,
  };
}

// ---- Pretty tables ------------------------------------------------------

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const sc = (n: number) => n.toFixed(2);

function mark(r: FieldResult): string {
  if (r.pass && r.score === 1) return "✓";
  if (r.pass) return `~${sc(r.score)}`;
  return "✗";
}

export function perDocTable(reports: DocReport[]): string {
  const head = ["image", "src", "docNumber", "expiry", "country", "first", "last"];
  const rows = reports.map((r) => {
    const g = (k: FieldKey) => r.results.find((x) => x.key === k)!;
    return [
      r.image,
      r.parsedSource,
      mark(g("docNumber")),
      mark(g("expiryISO")),
      mark(g("country")),
      mark(g("firstName")),
      mark(g("lastName")),
    ];
  });
  return table(head, rows);
}

export function failureDetail(reports: DocReport[]): string {
  const lines: string[] = [];
  for (const r of reports) {
    const fails = r.results.filter((x) => !x.pass);
    if (!fails.length) continue;
    lines.push(`  ${r.image} [${r.parsedSource}]`);
    for (const f of fails) {
      lines.push(`    ${f.key.padEnd(10)} got=${JSON.stringify(f.got)} want=${JSON.stringify(f.want)} (${sc(f.score)})`);
    }
  }
  return lines.join("\n") || "  (none)";
}

export function aggregateTable(agg: Aggregate): string {
  const head = ["field", "pass", "avgScore", "avgFolded"];
  const order: FieldKey[] = [...STRUCTURED, ...FUZZY];
  const rows = order.map((k) => {
    const f = agg.byField[k];
    const folded = FUZZY.includes(k) ? sc(f.avgFolded) : "—";
    return [k, `${f.passed}/${f.total} (${pct(f.rate)})`, sc(f.avgScore), folded];
  });
  return table(head, rows);
}

function table(head: string[], rows: string[][]): string {
  const widths = head.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );
  const fmt = (cols: string[]) =>
    "| " + cols.map((c, i) => (c ?? "").padEnd(widths[i])).join(" | ") + " |";
  const sep = "|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|";
  return [fmt(head), sep, ...rows.map(fmt)].join("\n");
}
