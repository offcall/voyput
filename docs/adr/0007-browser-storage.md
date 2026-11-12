# ADR 0007: Browser Storage

## Status

Accepted

## Context

User data stays in the browser. Passport photos and a location CSV with tens of thousands of rows do not fit in `localStorage` (about 5 MB).

## Decision

- IndexedDB through Dexie (`apps/web/src/db/db.ts`): passports, photos (with blobs), extractions, stamps, locations, trips, and a key-value table for section state.
- Settings (API key, model, reasoning effort) in `localStorage` under `voyput:settings`.
- Schema changes add a new Dexie version; existing versions are never edited after release.

## Consequences

- Data survives reloads and is lost if the user clears site data.
- Tests use `fake-indexeddb` with a fresh database per test.
