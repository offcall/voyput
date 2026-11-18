# ADR 0038: Shared Data Module

## Status

Accepted. Amends ADR 0006 ("section state stays in its section").

## Context

Data that several sections use lived inside one of them: `useLiveQuery` in `features/import/photos`, `staysAfterEvidenceChange` in `features/trips`, the birth profile (`trips:*` kv keys) in `features/trips/tripStore.ts`. Sections imported each other's internals to reach it. Every screen also read the whole `locations` table and built its own index from it: with Review open, the shell, Collect and Review each ran a live read of 30k rows and built the same photo index; Insights read it twice more.

## Decision

- `apps/web/src/data/` holds data access and read models shared by more than one section: `useLiveQuery`, `evidenceChange.ts` (stays flags after evidence changes, ADR 0031), `profile.ts` (birth country and date; the kv key strings stay `trips:birth` and `trips:birthCountry`, they are stored data), `photoDays.ts` and `locations.tsx`. It may import `db/`, `@voyput/core` and React; it never imports a section.
- `LocationsProvider` (in `App`, inside `DbProvider`) reads `db.locations` once per change with a Dexie live query. Each read becomes one immutable `Locations`: the rows, plus the photo index (core `PhotoIndex`: sorted by day, day numbers, country codes), the day runs and the photo days, each built on first use and kept for that read. `useLocations()` returns it, undefined while the first read runs.
- Review (`useLocationHistory`), the Collect plan (`usePlan`), Stays (`TripsPage`, `loadTripsData`), Insights (`useVizSource`, `useStays`) and the CSV card summary (`useStoredLocations`) take their locations from it; none reads the whole table itself any more (the plan and the country colours still count rows and list country codes from the index). Writers (CSV import, demo) write the table directly.
- The app shell (`Layout`) computes the Collect plan once (`useLivePlan`) and hands it down with `PlanProvider`; Home and Collect read it with `usePlan()` instead of running their own live query.
- A section imports only its own folder, `data/`, `db/`, `ai/`, `settings/SettingsContext`, the named shared bits of `app/` (`countryColours`, `servedScripts`, `useMediaQuery`), `@voyput/core`, `@voyput/ui` and third-party packages. `apps/web/test/feature-boundaries.test.ts` scans every import under `features/` and fails on anything else; the imports of another section still allowed are listed there one by one with their reason, and the test fails when one is no longer needed. The Collect plan (`data/plan/`), `localToday` (`data/today.ts`) and the demo rows' uuid prefix moved to `data/` for this.
- Insights keeps its "read once when the page opens": it takes the first read it gets and ignores later ones. Stays shows photo days and evidence days from the current read; while it shows a suggestion (nothing stored), a new read suggests again.

## Consequences

- One read and one index build per change of `locations`, whatever the number of mounted consumers. Moving the build to a Web Worker later is a change in one file.
- The full table stays in memory for the app's lifetime once read (it did while any consumer was mounted before).
- A Stays load and a locations change written in the same transaction (demo load or removal) may arrive in either order; Stays then catches up with the next read instead of reading both in one go.
- Section state other than this shared data still stays in its section.
- `settings/` and `app/` are not scanned; Settings still imports `UndoToast`, `DateField` and `CountrySelect` from `features/trips`.
