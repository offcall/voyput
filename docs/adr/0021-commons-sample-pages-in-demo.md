# ADR 0021: Commons Sample Pages in the Demo

## Status

Accepted. Supersedes the "no real passport photos" rule of ADR 0010 for these pages.

## Context

The generated demo pages (ADR 0010) are clean drawings with stamps already reviewed. They show neither how a model copes with real stamps nor what Review is for. Freely licensed photos of real stamp pages exist on Wikimedia Commons.

## Decision

- The demo adds a second passport, "Sample stamps (Wikimedia Commons)" (`demo-samples`). It holds 10 single pages cropped from Commons photos under CC BY, CC BY-SA or public domain: `public/demo/sample-*.jpg`.
- Only stamp and visa pages are used: no bio-data page, no name, face, MRZ or passport number. Numbers that could tie a page to a person (a number printed along a page edge, a visa serial number, a receipt number, handwritten numbers) are covered.
- The stamps are the stored output of the default model (ADR 0020), parsed by the app's parser, in `public/demo/samples.json`. They are left unreviewed, so they never feed trips until the user reviews them, and loading them needs no API key.
- Sources, authors, licences and changes are listed in `public/demo/CREDITS.md` and in the demo card. The same id prefixes as ADR 0010 apply, so loading and removing work as before.

## Consequences

- The demo carries third-party images. Their attribution must stay with them, and the CC BY-SA crops stay CC BY-SA.
- `samples.json` is not rebuilt by `npm run demo:generate`. A new default model does not change it unless someone reruns the trial and regenerates it.
