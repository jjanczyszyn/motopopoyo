# OCR accuracy harness

A reproducible, field-level accuracy harness for the identity-document OCR used
in the reservation flow (`src/lib/ocrParse.ts` + `src/lib/ocrEngine.ts`). It
runs the real recognition + parsing pipeline against a set of **public specimen
documents** and scores each field against ground truth.

> **No real customer PII lives here.** Every image is an official government /
> EU *specimen* or a Wikimedia *sample/template* with a fake identity. See
> [Image sources & licences](#image-sources--licences).

## Run it

```bash
npm run test:ocr          # parse + score against the committed OCR cache (fast, offline)
# or the whole suite:
npm test
```

That prints a per-document table and aggregate tables for two profiles
(`baseline` = the old pipeline, `improved` = the shipped pipeline) and asserts
the pass thresholds on the `improved` profile.

### Regenerating the OCR cache

Recognition (Tesseract) is separated from scoring so the test is fast,
deterministic and offline — it reads cached OCR text from `ocr-cache/`. You only
need to regenerate when the images or the recognition pipeline change:

```bash
npm run ocr:recognize     # = node fixtures/harness/recognize.mjs all
```

Tesseract is deterministic for a fixed image + config, so one capture per
(image, profile) is reproducible. (The task's non-determinism caveat applies to
vision LLMs, not Tesseract.)

## Layout

```
fixtures/
  images/            13 specimen documents (passports, ID cards, a driver licence)
  ground_truth.json  expected fields per image (+ notes)
  ocr-cache/
    baseline/        OCR text from the OLD pipeline (eng, PSM 6, no preprocessing)
    improved/        OCR text from the NEW pipeline (preprocess + OCR-B MRZ pass)
  preprocessed/      debug: the preprocessed images fed to Tesseract (gitignored)
  harness/
    recognize.mjs    runs Tesseract over the images → ocr-cache (the slow step)
    preprocess.mjs   grayscale + upscale + contrast + MRZ-band crop (jimp)
    score.ts         exact-match (structured) + edit-distance (names) scoring
    run.ts           reads cache, parses, scores, builds tables
    accuracy.test.ts the acceptance gate (vitest)
    tessdata/        OCRB.traineddata.gz (also copied to /public/tessdata for the app)
```

## Scoring & thresholds

- **Structured fields** (`docNumber`, `expiryISO`, `country`) — exact match
  after light normalization.
- **Names** — normalized edit distance. Reported two ways: **diacritic-sensitive**
  (`avgScore`) and **diacritic-folded** (`avgFolded`). An MRZ is ASCII-only, so an
  MRZ-derived name can never carry accents; the gate uses the *folded* score
  (operational identity), while the sensitive score honestly surfaces the
  diacritic loss.

The gate runs over the **10 machine-readable documents** (TD3 passports + the
TD1 ID card). The 3 visual-zone documents (driver licence + two ID-card fronts)
are reported but **not gated** — they have no MRZ and depend on raw OCR of
stylised print.

| Metric (MRZ subset) | Threshold | Achieved |
|---|---|---|
| expiry exact | ≥ 95% | **100%** |
| country exact | ≥ 95% | **100%** |
| docNumber exact | ≥ 80% | **80%** |
| name similarity, folded (avg) | ≥ 0.85 | **0.90 / 0.93** (first/last) |

## Before / after

Baseline = the original app pipeline (stock `eng`, PSM 6, no preprocessing,
hand-rolled MRZ parsing with no check-digit validation). Final = the shipped
pipeline. Both measured on the same 10 MRZ documents:

| Metric (MRZ subset) | Baseline | Final |
|---|---|---|
| docNumber exact | 20% | **80%** |
| expiry exact | 50% | **100%** |
| country exact | 80% | **100%** |
| firstName (avg) | 0.41 | **0.88** (folded 0.90) |
| lastName (avg) | 0.45 | **0.91** (folded 0.93) |

### What changed, by stage

- **Recognition** (`ocrEngine.ts` / `recognize.mjs`):
  - Added preprocessing (grayscale, upscale small images, contrast). The old
    pipeline did none.
  - Added a dedicated **MRZ pass**: crop the bottom band and read it with the
    **OCR-B** Tesseract model. Stock `eng` renders the OCR-B `<` filler as
    `K/C/L/S`, which destroyed the `<<` name separator and broke MRZ detection;
    OCR-B reads it correctly.
- **Parsing** (`ocrParse.ts`):
  - **ICAO check-digit validation + OCR-confusion repair** of the document
    number (try the handful of glyphs Tesseract confuses — `0↔O↔D↔G↔B`,
    `1↔I↔T` … — to satisfy the check digit). Gated on the DOB/expiry check
    digits validating, so it never "corrects" a synthetic/garbled MRZ.
  - **Line-2-anchored TD3 detection**: line 2 (doc number + nationality + dates
    + check digits) is the reliable line; names come from the preceding line.
    Fixed false negatives (German `D<<` nationality, fictional `UTO`, `ITA`→`1TA`)
    and false positives (driver-licence pseudo-MRZ, name lines containing a
    country trigram like `ARENAS`→`ARE`).
  - TD1 tolerance for the `<<`→`<K<` separator garble; expanded country map
    (added Slovakia etc.); rejected implausible date years.

## Known failures (honest list)

- **`deu_passport` docNumber** — `C01X00T47` read as `COTX00T47`. The misread
  shares the *same* ICAO check digit (a mod-10 collision), so check-digit repair
  cannot catch it. Watermarked, low-res screenshot.
- **`deu_personalausweis_back` docNumber** — `T22000129` read as `T22G8O129`
  (the `000` run rendered as rounded glyphs). Beyond confident repair.
- **`prt` names** — `Inês`/`Garção de Magalhães` come back ASCII from the MRZ;
  perfect on the folded metric, penalized on the diacritic-sensitive one.
- **Visual-zone docs** (`svk_id`, `fra_driverlicense`, `deu_personalausweis_front`)
  — no MRZ; raw OCR of stylised print is unreliable. They correctly route to the
  visual-zone path (and to manual review in the app) rather than emitting wrong
  MRZ data. Not gated.

Clearing these would need a vision-LLM / cloud OCR, which we **reject for
privacy** (see below).

## Privacy

- OCR runs **entirely on-device** (Tesseract/WASM in the browser). No document
  image or extracted data is sent to any third-party OCR/vision service. This is
  the deliberate posture for **Colombia Ley 1581** and **GDPR** (EU tourists).
  Only the Tesseract model files are fetched.
- ⚠️ Separately: the app uploads the original ID image to **Convex storage** for
  audit (`src/screens/OCR.tsx`). That's a data-*retention* exposure (storing
  renters' IDs), not a third-party-transmission one — worth a retention/consent
  policy, but out of scope for this OCR fix.
- Fixtures are specimens only. Real documents shared during debugging must never
  be committed (see `/CLAUDE.md`); the gitignored `tests-local/` holds any
  redacted real-doc parser captures.

## Image sources & licences

All images are specimens/samples published for public reference, with fake
identities. Passport/ID specimens are from Wikimedia Commons
(`Category:Passport data pages` and national-document categories); most are
public-domain government works or CC-licensed. The OCR-B Tesseract model
(`OCRB.traineddata.gz`) is from
[`DaanVanVugt/tesseract-mrz`](https://github.com/DaanVanVugt/tesseract-mrz).
See each Wikimedia file page for its specific licence and attribution.
