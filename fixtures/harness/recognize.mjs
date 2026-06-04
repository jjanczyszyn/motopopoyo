// OCR recognition step for the accuracy harness.
//
// Runs tesseract.js over every fixture image for a given PROFILE and writes the
// raw text to fixtures/ocr-cache/<profile>/<image>.txt. Kept separate from
// scoring so the accuracy test (parse + score) is fast, offline and
// deterministic — it reads these cached texts instead of re-running OCR.
//
// Tesseract is deterministic for a fixed image + config, so one capture per
// (image, profile) is reproducible (the task's non-determinism caveat applies
// to vision LLMs, not to Tesseract).
//
// Usage:
//   node fixtures/harness/recognize.mjs baseline   # app's current config
//   node fixtures/harness/recognize.mjs improved   # Phase 2 pipeline
//   node fixtures/harness/recognize.mjs all
//
// Run from the repo root (needs the project's node_modules).

import { createWorker } from "tesseract.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..");
const IMAGES = join(FIXTURES, "images");
const CACHE = join(FIXTURES, "ocr-cache");
const PREP = join(FIXTURES, "preprocessed");
const TESSDATA = join(HERE, "tessdata"); // holds OCRB.traineddata.gz

const groundTruth = JSON.parse(readFileSync(join(FIXTURES, "ground_truth.json"), "utf8"));
const docs = groundTruth.documents;

// ---------------------------------------------------------------------------
// Profiles. Each describes how the app would recognise an image.
//
//   baseline : exactly what src/screens/OCR.tsx does today —
//              language "eng", PSM 6 (single uniform block), no preprocessing,
//              one pass over the whole image.
//
//   improved : Phase 2 pipeline — light preprocessing (grayscale + upscale +
//              contrast, see preprocess.mjs), and a dedicated second pass over
//              the MRZ band with an OCR-B-friendly character whitelist and PSM 7
//              (single line) so the two MRZ lines come back clean. The visual
//              zone still uses a full-image PSM 6 pass. The two texts are
//              concatenated; the parser already prefers the MRZ when present.
// ---------------------------------------------------------------------------
const PROFILES = {
  baseline: {
    langs: "eng",
    passes: [{ psm: "6" }],
  },
  improved: {
    preprocess: true,
    passes: [
      // MRZ band first, with the OCR-B model — it reads the "<" filler correctly
      // (the stock "eng" model renders it as K/C/L/S, which destroys the "<<"
      // name separator). Clean MRZ lines come first so the parser anchors on
      // them rather than the garbled full-image rendering.
      { lang: "OCRB", langPath: TESSDATA, psm: "6", region: "mrz" },
      // Visual zone, full image, stock English — feeds the no-MRZ fallback
      // (driver licenses, ID-card fronts).
      { lang: "eng", psm: "6" },
    ],
  },
};

// Workers are keyed by lang(+langPath) and reused across images/passes.
async function getWorker(workers, pass) {
  const lang = pass.lang ?? "eng";
  const key = `${lang}|${pass.langPath ?? ""}`;
  if (!workers.has(key)) {
    const opts = pass.langPath ? { langPath: pass.langPath, gzip: true } : {};
    // OEM 0 (legacy) — the OCR-B model is a Tesseract-4 legacy traineddata.
    const oem = lang === "OCRB" ? 0 : 1;
    workers.set(key, await createWorker(lang, oem, opts));
  }
  return workers.get(key);
}

async function recognizeProfile(profileName) {
  const profile = PROFILES[profileName];
  if (!profile) throw new Error(`Unknown profile: ${profileName}`);
  const outDir = join(CACHE, profileName);
  mkdirSync(outDir, { recursive: true });

  let prep = null;
  if (profile.preprocess) {
    prep = await import("./preprocess.mjs");
    mkdirSync(PREP, { recursive: true });
  }

  const workers = new Map();

  for (const doc of docs) {
    const imgPath = join(IMAGES, doc.image);
    if (!existsSync(imgPath)) {
      console.warn(`  ! missing image ${doc.image} — skipping`);
      continue;
    }
    const t0 = Date.now();
    const texts = [];
    for (const pass of profile.passes) {
      const worker = await getWorker(workers, pass);
      let src = imgPath;
      if (profile.preprocess) {
        src = await prep.prepare(imgPath, join(PREP, `${profileName}-${pass.region ?? "full"}-${doc.image}.png`), {
          region: pass.region,
        });
      }
      await worker.setParameters({
        tessedit_pageseg_mode: pass.psm,
        ...(pass.params ?? {}),
      });
      const { data } = await worker.recognize(src);
      texts.push(data.text);
    }
    const text = texts.join("\n");
    writeFileSync(join(outDir, `${doc.image}.txt`), text, "utf8");
    console.log(`  ${doc.image.padEnd(30)} ${String(Date.now() - t0).padStart(5)}ms  ${text.replace(/\s+/g, " ").trim().length} chars`);
  }

  for (const w of workers.values()) await w.terminate();
  console.log(`✓ wrote ${docs.length} files to ocr-cache/${profileName}/`);
}

const which = process.argv[2] ?? "baseline";
const names = which === "all" ? Object.keys(PROFILES) : [which];
for (const n of names) {
  console.log(`\n=== recognizing profile: ${n} ===`);
  await recognizeProfile(n);
}
