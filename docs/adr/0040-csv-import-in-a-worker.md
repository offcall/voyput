# ADR 0040: CSV Import in a Worker

## Status

Accepted. Changes the `worker-src` line of the CSP in `docs/deploy.md`.

## Context

Since ADR 0033 the location CSV has no country column, so every row gets `countryAt` against the Natural Earth 10m outlines (ADR 0037), a 4.4 MB JSON chunk parsed and indexed on first use. Parsing and locating a 30k-row file ran on the main thread and froze the page. The CSP said `worker-src 'none'`, so no worker could run.

## Decision

- `features/import/csv/parse.worker.ts` is a Vite module worker. It receives `{ text }`, loads the outlines, builds the locator once per worker, runs core's `parseLocationCsv` and posts back the result (rows and skipped count, or the missing columns or error). Its logic is `handleParseMessage` in `parseLocations.ts`, a plain async function tested without a worker.
- `parseLocationFile` starts one worker per import and terminates it after the answer. Where `Worker` is undefined (jsdom), cannot start, errors, or answers with a failure, it parses on the main thread exactly as before, so the result is the same either way.
- The main thread keeps the database transaction; only the parse result crosses the boundary (structured clone).
- Workers build as ES modules (`worker: { format: "es" }` in `apps/web/vite.config.ts`). The build emits the outlines once: one `country-outlines-*.js` in `dist/assets`, which both `parse.worker-*.js` and the main bundle import (checked with `npm run build` on 2026-11-18).
- The CSP allows `worker-src 'self'`: workers only from this site, no `blob:` or `data:` workers. A test in `apps/web/test/site-head.test.tsx` pins it.

## Consequences

- The page stays responsive while a large CSV is parsed and located. Not measured in a real browser.
- A deployment with the old `worker-src 'none'` still imports, on the main thread.
- Each import loads and indexes the outlines again inside a new worker; the main-thread locator cache is used only by the fallback.
- Module workers need current browsers (Firefox 114+, Safari 15+).
