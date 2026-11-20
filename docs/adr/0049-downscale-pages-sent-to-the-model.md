# ADR 0049: Downscale Pages Sent to the Model

## Status

Accepted.

## Context

Extract, Validate and Rescan send the page photo to OpenRouter or voyput-local as a data URL. Until now that was the full original, redrawn upright: a phone photo is 4032 × 3024 px and 3–5 MB, about 4–7 MB once base64-encoded. That makes uploads slow on mobile data and costs image tokens that may not improve the reading.

## Decision

- Before sending, `pageForModel` (`apps/web/src/ai/image.ts`) scales a page whose long side is over `MAX_SENT_LONG_SIDE` = **2048 px** down to that long side, keeping the aspect, and encodes it as JPEG at quality 0.9.
- A page that already fits keeps its size and type and is redrawn as before (quality 0.92), only to apply the user's rotation and EXIF orientation.
- Decoding goes through `createImageBitmap(blob, { imageOrientation: "from-image" })`, drawing through a canvas. No dependency.
- The stored original in IndexedDB is untouched: Review and backups keep the full photo.

## Measurement

The demo sample pages are only 1400 px high, under both 2048 and 1600, so all three sizes would send the same bytes. The trial therefore uses the same pages rebuilt at full resolution from their Wikimedia Commons originals (`apps/web/public/demo/CREDITS.md`). Each page is a full-height crop of its spread, at the offset where it matches the demo sample, with the sample's covers copied over. That gives long sides of 1674–1877 px. None is over 2048, so "2048" sends the original. The 1600 versions were scaled from these crops (JPEG, high quality). The 1400 row uses the demo samples themselves.

Run on 2026-11-20: `google/gemini-3.8-flash`, reasoning effort medium, one call per page, through `scripts/model-trial` with `--dir`. The parallel runs shared one budget guard, which stopped them at $0.37 of spend. Every size answered pages 01–04 (passport pages 7, 9, 19 and 21: 18 scored stamps, 17 dates, 15 directions). The table covers those 4 pages:

| Size | Long side | Request image bytes (base64, 4 pages) | Found | Country | Date | Direction | Cost | Avg s/page |
|---|---|---|---|---|---|---|---|---|
| Original (= 2048) | 1692–1877 | 3.85 MB | 18/18 | 18/18 | 17/17 | 13/15 | $0.130 | 59 |
| Original, second run | 1692–1877 | 3.85 MB | 18/18 | 18/18 | 17/17 | 12/15 | $0.132 | 65 |
| 1600 | 1600 | 2.23 MB | 17/18 | 17/18 | 16/17 | 12/15 | $0.164 | 78 |
| 1400 (demo samples) | 1400 | 1.78 MB | 18/18 | 18/18 | 17/17 | 14/15 | $0.134 | 60 |

- At 1600 the model missed one stamp on page 19, a dense page. Both runs at the original size found it.
- 1400 matched the original. Since 1600 lost a stamp, this reads as run-to-run noise rather than a sign that smaller is safe: the original's own direction score moved from 13 to 12 between two identical runs.
- Cost and latency do not fall with size. Most of the time and cost is the model's reasoning on dense pages (page 21 took 129–213 s), not the image tokens.

Result: 2048 stays. It is the only tested size that is not worse than the original on these pages, because here it is the original. 1600 is worse by one stamp. The sample is small (4 pages, one call per page and size), so the result rules out 1600 for now; it does not prove 2048 is the lowest safe size.

What the trial does not show: every trial page was under 2048 px, so the downscale this ADR adds never ran in it. No page was scaled to 2048, and there is no reading result at the operating point the decision is for (a 4032 × 3024 phone page sent at 2048 × 1536, JPEG 0.9). The one scaled data point (1600) lost a stamp.

Pending evidence: a later trial on pages whose long side is above 2048 px (full-size phone photos of stamp pages with ground truth), comparing the original with 2048. Until it is run and recorded here, 2048 rests on the reasoning above, not on a measurement.

## Consequences

- A 12 MP phone photo goes out at about 2048 × 1536 instead of 4032 × 3024: roughly a quarter of the pixels and a much smaller request.
- Pages up to 2048 px are sent as before.
- Phone photos, the case this targets, were not in the trial: the repository has no public full-size phone photos of stamp pages with ground truth.
