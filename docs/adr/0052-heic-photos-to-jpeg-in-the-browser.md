# ADR 0052: HEIC Photos to JPEG in the Browser

## Status

Accepted. Partly supersedes ADR 0003 (its "No HEIC conversion"). Changes the `script-src` line of the CSP in `docs/deploy.md`.

## Context

iPhones save photos as HEIC. ADR 0003 accepted only JPEG and PNG, so a tester who dropped iPhone pages got "not supported" and had to convert them elsewhere. Only Safari decodes HEIC itself; Chrome and Firefox do not. The model, Review and the backup format all expect JPEG or PNG.

## Decision

- **Converted once, on import.** `addPhotos` turns each HEIC/HEIF file (MIME `image/heic`/`image/heif`, or extension `.heic`/`.heif` when the browser reports no type) into a full-size JPEG at quality 0.92 and stores that, with `mimeType` `image/jpeg`. The stored type list stays JPEG and PNG; backups and the rest of the app see a normal JPEG. The photo keeps its file name and the HEIC file's size, so adding the same file again is still found as a duplicate, before converting.
- **Browser first.** `createImageBitmap` on the file (Safari): drawn to a canvas and encoded as JPEG, nothing downloaded. The bitmap applies the photo's orientation.
- **Otherwise libheif in a worker.** New runtime dependency `libheif-js` (LGPL-3.0), its separate-wasm build: the 91 KB glue in `heic.worker.ts` (a Vite module worker) and the package's `libheif.wasm` (1.46 MB, 0.49 MB gzip) emitted unmodified as its own asset. The worker starts on the first HEIC photo of an import that the browser cannot decode, fetches the wasm then, decodes one photo at a time, encodes with `OffscreenCanvas`, and ends after the import. libheif applies the HEIF rotation and mirroring. JPEG and PNG users download none of it; the main bundle holds only the worker's URL.
- **Feedback.** "Converting N HEIC photos…" while it runs; a failed file gets its own error and is not stored; the others are.
- **CSP.** `script-src` adds `'wasm-unsafe-eval'`, which allows compiling WebAssembly and nothing else; `'unsafe-eval'` stays off. `worker-src 'self'` is unchanged. `apps/web/test/site-head.test.tsx` pins both.
- **Licence.** Vite's licence file covers the main bundle only, so a build plugin in `apps/web/vite.config.ts` appends libheif-js's `LICENSE`, libheif's notice (`libheif-wasm/LICENSE`) and the source links to `third-party-licenses.txt`. The wasm stays a separate, unmodified file, so it can be replaced (LGPL).
- **iOS picker.** iOS hands the page a JPEG it converts itself when the input's `accept` does not name HEIC, and the original HEIC when it does. So on iPhone and iPad `accept` lists only JPEG and PNG; elsewhere it adds `image/heic,image/heif,.heic,.heif` so desktop pickers show HEIC files. Not verified on a device.

## Alternatives

- `libheif-js/wasm-bundle` (wasm inlined as base64): about 700 KB gzip and one file that cannot be swapped.
- A server-side converter: voyput has no server (ADR 0003).
- Keep rejecting HEIC: every iPhone user meets it first.

## Consequences

- HEIC works in Chrome, Firefox and Safari with no extra step. Measured in headless Chromium on a synthetic 4032 × 3024 test pattern: about 0.6 s per photo end to end with the first wasm load, 0.4 s after it. Real photos have more detail and decode slower.
- A deployment that keeps the old CSP still imports JPEG and PNG; HEIC files then fail with the browser's CSP message.
- The site carries an LGPL component; its licence ships with the build.
