# ADR 0050: Several Location Files

## Status

Accepted.

## Context

A new photo-location CSV replaced all stored locations. People with more than one Photos library (a Mac export and another library) could keep only one of them. The `locations` table is keyed by `uuid`; rows from a file without a `uuid` column get one derived from date, position and file name, so the same photo exported by two libraries can have two keys.

## Decision

- With locations stored, a new file asks: **Replace** (as before) or **Add to them**.
- Add stores only rows not there yet (core `mergeLocations`). A row is already there when a stored row has its uuid, or, unless both rows came with their own uuid, was taken in the same UTC second within 50 m. Inside one file only the uuid counts. Two different real uuids are two photos.
- The imported files are listed in `db.kv` under `import:locationFiles`: per file its name, valid rows, first and last day, import time and the stored uuids of its rows (new or matched). No new Dexie version, no new field on `LocationRow`.
- Replace lists only the new file. The first Add over rows imported before the list existed lists those rows as "Imported before"; demo rows are never listed.
- Removing a file deletes the uuids only it lists, keeps those another file also lists, and marks the stays that lose photos, as Replace does.
- Add changes and removes no stored photo, so it marks no stays. Photo days, stay suggestions and review checks read the live `locations` table (ADR 0038) and refresh as after Replace.

## Consequences

- The file list holds one uuid per row: a few MB for a large library, in the same IndexedDB.
- The list is only as right as the writes that keep it: the demo's load and removal touch only `demo-` rows, which no file lists.
- A photo whose time or position differs between two exports by more than a second or 50 m is stored twice.
