// Image preprocessing for the "improved" recognition profile.
//
// Tesseract does markedly better on clean, high-contrast, sufficiently large
// grayscale input. The app currently feeds the raw photo straight in (no
// preprocessing at all), which is why low-resolution and busy specimens lose
// their MRZ. Here we:
//   - (optionally) crop to the MRZ band — the bottom ~28% of the page, where
//     the two/three OCR-B lines live — so the recogniser isn't distracted by
//     the portrait, holograms and guilloché of the visual zone;
//   - convert to grayscale;
//   - upscale small images so MRZ glyphs clear Tesseract's ~20px x-height floor;
//   - bump contrast to separate ink from security-print background.
//
// The browser app mirrors this with a <canvas> implementation in
// src/lib/imagePrep.ts so the harness measures the same pipeline the users get.

import { Jimp } from "jimp";

// Lower bound on the long edge after upscaling. MRZ lines need big glyphs.
const MIN_LONG_EDGE = 2000;
// Fraction of the page height the MRZ band occupies (from the bottom). Sized to
// comfortably include all three lines of a TD1 ID card, not just a TD3 pair.
const MRZ_BAND_FRACTION = 0.34;

export async function prepare(srcPath, outPath, { region } = {}) {
  const img = await Jimp.read(srcPath);

  if (region === "mrz") {
    const w = img.bitmap.width;
    const h = img.bitmap.height;
    const bandH = Math.round(h * MRZ_BAND_FRACTION);
    img.crop({ x: 0, y: h - bandH, w, h: bandH });
  }

  img.greyscale();

  const longEdge = Math.max(img.bitmap.width, img.bitmap.height);
  if (longEdge < MIN_LONG_EDGE) {
    const factor = MIN_LONG_EDGE / longEdge;
    img.scale(factor);
  }

  img.contrast(0.25);

  await img.write(outPath);
  return outPath;
}
