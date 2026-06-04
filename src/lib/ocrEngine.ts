// Browser-side OCR pipeline for identity documents.
//
// This mirrors the validated "improved" profile in fixtures/harness/recognize.mjs
// (which the accuracy harness measures), so what ships matches what we test:
//
//   1. Preprocess the photo on a <canvas>: grayscale, upscale small images, and
//      bump contrast. (The old pipeline fed the raw photo straight to Tesseract
//      with no preprocessing — the single biggest cause of unreadable MRZs.)
//   2. MRZ pass: crop the bottom band and recognise it with the OCR-B model.
//      Stock "eng" renders the OCR-B "<" filler as K/C/L/S and destroys the MRZ;
//      the OCR-B model reads it correctly. This is where passports/ID cards get
//      their reliable, check-digit-verified fields.
//   3. Visual pass: full image with stock "eng", for documents without a
//      machine-readable zone (driver's licences, ID-card fronts).
//   4. Concatenate (MRZ first) and hand to parseDocumentText, which prefers the
//      MRZ and falls back to the visual zone.
//
// Privacy: recognition runs entirely on-device. Only the Tesseract model files
// are fetched (no document data leaves the browser), which keeps us clear of
// Colombia Ley 1581 / GDPR exposure from shipping IDs to a cloud OCR service.

import { parseDocumentText, ParsedDocument } from "./ocrParse";

// Fraction of page height occupied by the MRZ band (bottom). Sized to include
// all three lines of a TD1 ID card. Keep in sync with preprocess.mjs.
const MRZ_BAND_FRACTION = 0.34;
const MIN_LONG_EDGE = 2000;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// Grayscale + upscale + contrast, optionally cropped to the MRZ band. Returns a
// canvas Tesseract can consume directly.
function preprocess(img: HTMLImageElement, region?: "mrz"): HTMLCanvasElement {
  const sx = 0;
  const sy = region === "mrz" ? Math.round(img.height * (1 - MRZ_BAND_FRACTION)) : 0;
  const sw = img.width;
  const sh = region === "mrz" ? img.height - sy : img.height;

  const longEdge = Math.max(sw, sh);
  const scale = longEdge < MIN_LONG_EDGE ? MIN_LONG_EDGE / longEdge : 1;
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

  const data = ctx.getImageData(0, 0, dw, dh);
  const px = data.data;
  // contrast factor ~ jimp's 0.25
  const c = 1.6;
  const intercept = 128 * (1 - c);
  for (let i = 0; i < px.length; i += 4) {
    let g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    g = c * g + intercept;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    px[i] = px[i + 1] = px[i + 2] = g;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export interface RecognizeResult {
  text: string;
  parsed: ParsedDocument;
}

// Path to the OCR-B model directory (served from /public). tesseract.js fetches
// `${langPath}/OCRB.traineddata.gz`.
const OCRB_LANG_PATH = `${import.meta.env.BASE_URL}tessdata`;

export async function recognizeDocument(
  file: Blob,
  onProgress?: (pct: number) => void
): Promise<RecognizeResult> {
  const { createWorker } = await import("tesseract.js");
  const img = await loadImage(file);

  const texts: string[] = [];

  // --- MRZ pass (OCR-B, cropped band) -------------------------------------
  // Best-effort: if the OCR-B model can't be fetched, we still get the visual
  // pass below, so the flow degrades rather than failing outright.
  try {
    const mrzCanvas = preprocess(img, "mrz");
    const ocrb = await createWorker("OCRB", 0, { langPath: OCRB_LANG_PATH, gzip: true });
    await ocrb.setParameters({ tessedit_pageseg_mode: "6" as never });
    const { data } = await ocrb.recognize(mrzCanvas);
    texts.push(data.text);
    await ocrb.terminate();
  } catch (err) {
    console.warn("MRZ (OCR-B) pass failed; continuing with visual pass only", err);
  }

  // --- Visual pass (stock English, full image) ----------------------------
  const fullCanvas = preprocess(img);
  const eng = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (onProgress && m.status === "recognizing text") onProgress(Math.round(m.progress * 100));
    },
  });
  await eng.setParameters({ tessedit_pageseg_mode: "6" as never });
  const { data } = await eng.recognize(fullCanvas);
  texts.push(data.text);
  await eng.terminate();

  const text = texts.join("\n");
  return { text, parsed: parseDocumentText(text) };
}
