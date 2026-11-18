# ADR 0039: Frozen Database Upgrades

## Status

Accepted. Amends ADR 0007 (schema changes).

## Context

ADR 0007 says existing Dexie versions are never edited after release. The version 3 upgrade built a history with the live `suggestHistory`, `legacyTripStays` and `legacyTripCountry` from `@voyput/core`, and version 5 used the live `sortStays`, `isCountryCode` and the id pattern of the old suggester. Every change in `packages/core/src/trips` silently changed what these released upgrades do to an old database (ADR 0022 already had), while `db.ts` itself looked untouched.

## Decision

- An upgrade function runs only frozen code: `apps/web/src/db/migrations/v<N>.ts`, one file per Dexie version, holding exactly the logic and stored shapes that version needs, copied at the time it is frozen.
- Each file starts with "Frozen: do not edit", the files it was copied from, and the date it was copied. A frozen file is never changed; a fix to old data is a new version.
- Frozen files import nothing at runtime from `@voyput/core`, `packages/core` or `features/` (types only, and the current ones inline their stored shapes). A source scan test (`apps/web/test/db-migrations.test.ts`) enforces this.
- `db.ts` declares the schema and calls the frozen upgrades. Versions 3 and 5 were copied on 2026-11-18, with the behaviour they had then.

## Consequences

- Core may change freely without changing what an old database upgrades to. The v2 fixture tests in `apps/web/test/db.test.ts` pin the frozen behaviour.
- The suggester logic exists twice (core and `migrations/v3.ts`); the copy is dead weight that only old databases run. Fixes in core do not reach it.
- In core, `legacyTripStays` now serves only the Stays page's unplaced trips, and `legacyTripCountry` has no caller outside core's own tests; removing that path no longer touches the upgrade.
