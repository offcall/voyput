# ADR 0049: Downscale Pages Sent to the Model

## Status

Proposed. The constant is provisional until the size trial below has run.

## Context

Extract, Validate and Rescan send the page photo to OpenRouter or voyput-local as a data URL. Until now that was the full original, redrawn upright: a phone photo is 4032 × 3024 px and 3–5 MB, about 4–7 MB once base64-encoded. That makes uploads slow on mobile data and costs image tokens that may not improve the reading.

## Decision

- Before sending, `pageForModel` (`apps/web/src/ai/image.ts`) scales a page whose long side is over `MAX_SENT_LONG_SIDE` = **2048 px** down to that long side, keeping the aspect, and encodes it as JPEG at quality 0.9.
- A page that already fits keeps its size and type and is redrawn as before (quality 0.92), only to apply the user's rotation and EXIF orientation.
- Decoding goes through `createImageBitmap(blob, { imageOrientation: "from-image" })`, drawing through a canvas. No dependency.
- The stored original in IndexedDB is untouched: Review and backups keep the full photo.

## Measurement (pending)

The demo sample pages are only 1400 px high, under both 2048 and 1600, so all three sizes would send the same bytes. The trial therefore uses the same 8 pages rebuilt at full resolution from their Wikimedia Commons originals (`apps/web/public/demo/CREDITS.md`). Each page is a full-height crop of its spread, at the offset where it matches the demo sample, with the sample's covers copied over. That gives long sides of 1674–1877 px, 0.5–0.8 MB as JPEG. Samples 09–10 (737 px originals) are left out because every size sends them unchanged.

Planned runs, all with `google/gemini-3.8-flash`, reasoning effort medium, one call per page, through `scripts/model-trial` with `--dir`:

| Size | Long side | Image bytes (8 pages) | Found | Country | Date | Direction | Cost | Avg s/page |
|---|---|---|---|---|---|---|---|---|
| Original (= 2048: none is larger) | 1674–1877 | 5.52 MB | – | – | – | – | – | – |
| Original, second run (noise) | 1674–1877 | 5.52 MB | – | – | – | – | – | – |
| 1600 | 1600 | 3.43 MB | – | – | – | – | – | – |
| 1400 (demo samples) | 1400 | 2.76 MB | – | – | – | – | – | – |

Not run: the OpenRouter key available on 2026-11-20 had expired, so no calls were made and nothing was spent. Until the trial runs, 2048 is kept. It is the starting value, and on these pages it is the same as sending the original.

## Consequences

- A 12 MP phone photo goes out at about 2048 × 1536 instead of 4032 × 3024: roughly a quarter of the pixels and a much smaller request.
- Pages up to 2048 px are sent as before.
- The trial result sets the constant before this ADR is accepted: the smallest size that is as accurate as the original on these pages.
