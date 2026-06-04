// OCR recognition step for the accuracy harness. Runs the SAME pipeline as the
// browser engine (src/lib/ocrEngine.ts) via the shared src/lib/imageOps.ts, so
// the harness measures exactly what ships. Writes raw text to
// fixtures/ocr-cache/<profile>/<image>.txt (kept separate from scoring so the
// accuracy test is fast, offline and deterministic).
//
// Run from the repo root:
//   npx tsx fixtures/harness/recognize.ts all        # baseline + improved
//   npx tsx fixtures/harness/recognize.ts improved
//
// Cache format: "<MRZ pass>\n===VISUAL===\n<visual passes>".

import { createWorker, Worker } from "tesseract.js";
import { Jimp } from "jimp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanChannel, grayToRgba } from "../../src/lib/imageOps";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..");
const IMAGES = join(FIXTURES, "images");
const CACHE = join(FIXTURES, "ocr-cache");
const TMP = join(FIXTURES, "preprocessed");
const TESSDATA = join(HERE, "tessdata");

const groundTruth = JSON.parse(readFileSync(join(FIXTURES, "ground_truth.json"), "utf8"));
const docs: { image: string }[] = groundTruth.documents;

const MRZ_BAND_FRACTION = 0.34;
const MRZ_MIN_LONG_EDGE = 2000;
const VISUAL_TARGET_LONG_EDGE = 1800; // upscale small photos, downscale huge ones

// Scale factor to bring an image toward the OCR target size (cap upscaling at 3x
// so we don't blow up tiny inputs into mush).
function targetScale(longEdge: number): number {
  if (longEdge < VISUAL_TARGET_LONG_EDGE) return Math.min(3, VISUAL_TARGET_LONG_EDGE / longEdge);
  if (longEdge > 2000) return 2000 / longEdge;
  return 1;
}

type JimpImg = Awaited<ReturnType<typeof Jimp.read>>;

function rgbaOf(img: JimpImg): Uint8ClampedArray {
  return new Uint8ClampedArray(img.bitmap.data);
}

async function writePng(img: JimpImg, gray: Uint8ClampedArray, path: string) {
  const out = img.clone();
  out.bitmap.data = Buffer.from(grayToRgba(gray));
  await out.write(path as `${string}.png`);
}

// MRZ band: bottom slice, grayscale, upscaled — for the OCR-B model.
async function mrzBand(img: JimpImg, path: string): Promise<string> {
  const { width, height } = img.bitmap;
  const sy = Math.round(height * (1 - MRZ_BAND_FRACTION));
  const band = img.clone().crop({ x: 0, y: sy, w: width, h: height - sy }).greyscale();
  const longEdge = Math.max(band.bitmap.width, band.bitmap.height);
  if (longEdge < MRZ_MIN_LONG_EDGE) band.scale(MRZ_MIN_LONG_EDGE / longEdge);
  await band.write(path as `${string}.png`);
  return path;
}

const PROFILES: Record<string, { improved: boolean }> = {
  baseline: { improved: false }, // old pipeline: single eng pass, no cleanup
  improved: { improved: true },  // OCR-B MRZ band + red/green cleaned visual passes
};

async function recognizeProfile(name: string) {
  const profile = PROFILES[name];
  const outDir = join(CACHE, name);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(TMP, { recursive: true });

  const eng = await createWorker("eng", 1);
  await eng.setParameters({ tessedit_pageseg_mode: "6" as never });
  let ocrb: Worker | null = null;

  for (const doc of docs) {
    const imgPath = join(IMAGES, doc.image);
    if (!existsSync(imgPath)) { console.warn(`  ! missing ${doc.image}`); continue; }
    const t0 = Date.now();
    const img = await Jimp.read(imgPath);

    let mrzText = "";
    const visualParts: string[] = [];

    if (!profile.improved) {
      // Baseline: one full-image grayscale eng pass.
      const g = img.clone().greyscale();
      const p = join(TMP, `baseline-${doc.image}.png`);
      await g.write(p as `${string}.png`);
      visualParts.push((await eng.recognize(p)).data.text);
    } else {
      // MRZ band with OCR-B.
      if (!ocrb) ocrb = await createWorker("OCRB", 0, { langPath: TESSDATA, gzip: true });
      await ocrb.setParameters({ tessedit_pageseg_mode: "6" as never });
      mrzText = (await ocrb.recognize(await mrzBand(img, join(TMP, `mrz-${doc.image}.png`)))).data.text;

      // Visual passes (capped resolution):
      //   - plain grayscale: clean documents (most passports, simple IDs);
      //   - red channel cleaned: dark text over a guilloché pattern;
      //   - green channel cleaned: RED text (US ID numbers/dates) over guilloché.
      // Unioned, so the parser gets the best reading per field across doc types.
      const base = img.clone();
      const s = targetScale(Math.max(base.bitmap.width, base.bitmap.height));
      if (s !== 1) base.scale(s);
      const { width: w, height: h } = base.bitmap;
      const rgba = rgbaOf(base);

      const plain = base.clone().greyscale();
      const pp = join(TMP, `plain-${doc.image}.png`);
      await plain.write(pp as `${string}.png`);
      visualParts.push((await eng.recognize(pp)).data.text);

      for (const ch of ["r", "g"] as const) {
        const clean = cleanChannel(rgba, w, h, ch, 2);
        const p = join(TMP, `${ch}-${doc.image}.png`);
        await writePng(base, clean, p);
        visualParts.push((await eng.recognize(p)).data.text);
      }
    }

    const text = `${mrzText}\n===VISUAL===\n${visualParts.join("\n")}`;
    writeFileSync(join(outDir, `${doc.image}.txt`), text, "utf8");
    console.log(`  ${doc.image.padEnd(30)} ${String(Date.now() - t0).padStart(6)}ms`);
  }

  await eng.terminate();
  if (ocrb) await ocrb.terminate();
  console.log(`✓ wrote ${docs.length} files to ocr-cache/${name}/`);
}

const which = process.argv[2] ?? "improved";
const names = which === "all" ? Object.keys(PROFILES) : [which];
for (const n of names) {
  console.log(`\n=== recognizing profile: ${n} ===`);
  await recognizeProfile(n);
}
