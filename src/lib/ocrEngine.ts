// Browser-side OCR pipeline for identity documents. Mirrors the Node accuracy
// harness (fixtures/harness/recognize.ts) so what ships is what we measure.
//
// Passes (text from all of them is unioned and handed to the parser):
//   1. MRZ band (OCR-B model) — passports & MRZ ID cards. The OCR-B model reads
//      the "<" filler that stock English mangles.
//   2. Visual zone, plain grayscale — clean documents.
//   3. Visual zone, RED channel, cleaned — dark/black text over a security
//      background.
//   4. Visual zone, GREEN channel, cleaned — RED text (the ID number and dates
//      on US driver's licences / ID cards) over a security background.
//   Cleaning = contrast-stretch → Otsu threshold → morphological opening, which
//   erases the guilloché security pattern while keeping the character strokes
//   (see src/lib/imageOps.ts).
//
// Everything runs on-device (Tesseract/WASM). No document data leaves the
// browser — only the model files are fetched (Ley 1581 / GDPR).

import { parseDocumentSplit, ParsedDocument } from "./ocrParse";
import { cleanChannel, grayToRgba } from "./imageOps";

const MRZ_BAND_FRACTION = 0.34;
const MRZ_MIN_LONG_EDGE = 2000;
const VISUAL_TARGET_LONG_EDGE = 1800; // upscale small photos, downscale huge ones
const OCRB_LANG_PATH = `${import.meta.env.BASE_URL}tessdata`;

function targetScale(longEdge: number): number {
  if (longEdge < VISUAL_TARGET_LONG_EDGE) return Math.min(3, VISUAL_TARGET_LONG_EDGE / longEdge);
  if (longEdge > 2000) return 2000 / longEdge;
  return 1;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function newCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true })!];
}

// MRZ band: grayscale + upscale (the OCR-B model handles the band's own noise).
function mrzCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const sy = Math.round(img.height * (1 - MRZ_BAND_FRACTION));
  const sh = img.height - sy;
  const scale = Math.max(1, MRZ_MIN_LONG_EDGE / Math.max(img.width, sh));
  const w = Math.round(img.width * scale), h = Math.round(sh * scale);
  const [c, ctx] = newCanvas(w, h);
  ctx.drawImage(img, 0, sy, img.width, sh, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    d.data[i] = d.data[i + 1] = d.data[i + 2] = g < 0 ? 0 : g > 255 ? 255 : g;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

function scaledDims(img: HTMLImageElement): [number, number] {
  const scale = targetScale(Math.max(img.width, img.height));
  return [Math.round(img.width * scale), Math.round(img.height * scale)];
}

// Plain grayscale canvas (clean documents read best without morphology).
function grayCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const [w, h] = scaledDims(img);
  const [c, ctx] = newCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    d.data[i] = d.data[i + 1] = d.data[i + 2] = g;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

// A cleaned single-channel canvas (contrast→Otsu→morph-open) for guilloché docs.
function cleanedCanvas(img: HTMLImageElement, channel: "r" | "g"): HTMLCanvasElement {
  const [w, h] = scaledDims(img);
  const [c, ctx] = newCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  const clean = cleanChannel(new Uint8ClampedArray(d.data), w, h, channel, 2);
  d.data.set(grayToRgba(clean));
  ctx.putImageData(d, 0, 0);
  return c;
}

export interface RecognizeResult {
  text: string;
  parsed: ParsedDocument;
}

export async function recognizeDocument(
  file: Blob,
  onProgress?: (pct: number) => void
): Promise<RecognizeResult> {
  const { createWorker } = await import("tesseract.js");
  const img = await loadImage(file);
  onProgress?.(5);

  // --- MRZ pass (OCR-B) ---------------------------------------------------
  let mrzText = "";
  try {
    const ocrb = await createWorker("OCRB", 0, { langPath: OCRB_LANG_PATH, gzip: true });
    await ocrb.setParameters({ tessedit_pageseg_mode: "6" as never });
    mrzText = (await ocrb.recognize(mrzCanvas(img))).data.text;
    await ocrb.terminate();
  } catch (err) {
    console.warn("MRZ (OCR-B) pass failed; continuing with visual passes", err);
  }
  onProgress?.(40);

  // --- Visual passes: plain gray + red/green cleaned ----------------------
  const eng = await createWorker("eng", 1);
  await eng.setParameters({ tessedit_pageseg_mode: "6" as never });
  const plainText = (await eng.recognize(grayCanvas(img))).data.text;
  onProgress?.(60);
  const redText = (await eng.recognize(cleanedCanvas(img, "r"))).data.text;
  onProgress?.(80);
  const grnText = (await eng.recognize(cleanedCanvas(img, "g"))).data.text;
  await eng.terminate();
  onProgress?.(100);

  const visualText = `${plainText}\n${redText}\n${grnText}`;
  const text = `${mrzText}\n===VISUAL===\n${visualText}`;
  return { text, parsed: parseDocumentSplit(mrzText, visualText) };
}
