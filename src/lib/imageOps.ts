// Pure-JS image preprocessing shared by the browser engine (canvas) and the
// Node accuracy harness (jimp), so what we measure is exactly what ships.
//
// The hard case is a driver's licence / ID card: small COLOURED text printed
// over a dense guilloché security pattern. The winning recipe (validated with
// ImageMagick, reproduced here) is:
//   1. take a single colour CHANNEL  — red isolates dark/black text, green
//      isolates red text (numbers/dates on US IDs), each against the light bg;
//   2. CONTRAST-STRETCH to spread the ink/background apart;
//   3. OTSU THRESHOLD to a clean black-on-white binary;
//   4. MORPHOLOGICAL OPENING to erase the thin guilloché lines while keeping the
//      thick character strokes — this is what makes the text readable.
//
// All functions operate on plain typed arrays so they run identically in the
// browser and Node.

export type Gray = Uint8ClampedArray; // one byte per pixel, 0=black..255=white

// Extract a single channel (or luminance) from RGBA pixel data as grayscale.
export function channelToGray(
  rgba: Uint8ClampedArray,
  channel: "r" | "g" | "b" | "l"
): Gray {
  const n = rgba.length / 4;
  const out = new Uint8ClampedArray(n);
  const off = channel === "r" ? 0 : channel === "g" ? 1 : channel === "b" ? 2 : -1;
  for (let i = 0; i < n; i++) {
    if (off >= 0) out[i] = rgba[i * 4 + off];
    else out[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  }
  return out;
}

// Percentile contrast stretch: clip the darkest `lowPct` and brightest
// `highPct` of pixels, then linearly rescale to 0..255.
export function contrastStretch(gray: Gray, lowPct = 0.05, highPct = 0.22): Gray {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let lo = 0, hi = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * lowPct) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * highPct) { hi = v; break; } }
  if (hi <= lo) return gray;
  const scale = 255 / (hi - lo);
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = (gray[i] - lo) * scale;
  return out;
}

// Otsu's method: the grayscale threshold that best separates dark/light.
export function otsuThreshold(gray: Gray): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let sumB = 0, wB = 0, maxVar = -1, threshold = 127;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += v * hist[v];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; threshold = v; }
  }
  return threshold;
}

// Binarize: pixels at/below `t` become ink (0), the rest background (255).
export function threshold(gray: Gray, t: number): Gray {
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = gray[i] <= t ? 0 : 255;
  return out;
}

// Separable min/max box filters (radius r → (2r+1) window). On a binary image
// where ink=0: a MAX filter erodes the ink (thin strokes vanish), a MIN filter
// dilates it back. Opening = erode then dilate.
function boxFilter(bin: Gray, w: number, h: number, r: number, take: "min" | "max"): Gray {
  const pick = take === "min" ? Math.min : Math.max;
  const tmp = new Uint8ClampedArray(bin.length);
  // horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = take === "min" ? 255 : 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        acc = pick(acc, bin[row + xx]);
      }
      tmp[row + x] = acc;
    }
  }
  // vertical
  const out = new Uint8ClampedArray(bin.length);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let acc = take === "min" ? 255 : 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        acc = pick(acc, tmp[yy * w + x]);
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

// Morphological opening on the ink (erase thin lines, keep thick strokes).
export function morphOpenInk(bin: Gray, w: number, h: number, r = 2): Gray {
  const eroded = boxFilter(bin, w, h, r, "max"); // shrink ink
  return boxFilter(eroded, w, h, r, "min"); // grow ink back
}

// Full cleanup pipeline for one channel → clean black-on-white binary.
export function cleanChannel(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  channel: "r" | "g" | "b" | "l",
  openRadius = 2
): Gray {
  let g = channelToGray(rgba, channel);
  g = contrastStretch(g);
  g = threshold(g, otsuThreshold(g));
  if (openRadius > 0) g = morphOpenInk(g, w, h, openRadius);
  return g;
}

// Expand a grayscale buffer back to RGBA (for canvas/jimp output).
export function grayToRgba(gray: Gray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length * 4);
  for (let i = 0; i < gray.length; i++) {
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = gray[i];
    out[i * 4 + 3] = 255;
  }
  return out;
}
