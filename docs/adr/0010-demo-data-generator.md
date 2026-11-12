# ADR 0010: Demo Data Generator

## Status

Accepted

## Context

The app needs demo data that works without an API key and that tests reuse (ADR 0009). It must hold no real passport photos and no personal location history.

## Decision

- A TypeScript script in `scripts/demo` (`npm run demo:generate`) draws fictional passport pages as SVG and writes the demo files to `apps/web/public/demo`: page PNGs, `demo.json` (passport, photos, ground-truth stamps) and `photo_locations.csv`.
- SVG is rasterized with `@resvg/resvg-js`, a root dev dependency. It is not used by the app.
- Output is deterministic (fixed seed and dates) and committed, so the app and tests never run the generator.
- Every demo row carries a fixed id prefix (`demo-passport`, `demo-photo-`, `demo-stamp-`, `demo-` location uuids). Loading and removing touch only rows with these ids.
- `scripts` is type-checked by the root `tsconfig.json` (`allowImportingTsExtensions`, as Node runs the `.ts` files directly).

## Alternatives

- Canvas in the browser at load time: no extra dependency, but tests in jsdom would have no images and the pages would differ per browser.
- `sharp`: larger native dependency for the same job.

## Consequences

- Changing the demo means editing `scripts/demo/scenario.ts` and regenerating; the PNGs depend on the system fonts present when generating.
- Demo rows mix with the user's own data until removed from the Import page.
