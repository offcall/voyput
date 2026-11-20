# ADR 0048: Backup File Format

## Status

Accepted.

## Context

Everything a user brings and edits lives only in this browser (IndexedDB, ADR 0007; settings in localStorage). Clearing site data, a new browser or a new computer loses it, and there was no way to keep a copy. The owner asked for an export of all user data to one file and an import that replaces everything with it, without encryption and without new dependencies.

## Decision

- One JSON file, `voyput-backup-YYYY-MM-DD.json`, written and read by `apps/web/src/settings/backup.ts`:

  ```json
  {
    "format": "voyput-backup",
    "version": 1,
    "exportedAt": "2026-11-20T10:00:00.000Z",
    "dbVersion": 5,
    "includesPhotos": true,
    "settings": { "model": "…", "reasoningEffort": "medium", "locationWindowDays": 10,
                  "aiProvider": "openrouter", "localEngine": "auto", "localPort": 47615 },
    "tables": { "passports": [], "photos": [], "extractions": [], "stamps": [],
                "locations": [], "stays": [], "kv": [] }
  }
  ```

- `tables` holds every row of every Dexie table as stored: rows are read with `Collection.raw()`, past reading hooks, so a stamp with an implausible stored date (ADR 0044) keeps that date and its dismissed warnings. A photo row is its `PassportPhoto` fields plus `data`, the image bytes in base64; the `Blob` itself is not JSON. JSON with base64 needs no dependency and stays readable; base64 makes photos a third larger, which is acceptable next to a zip writer and reader of our own.
- Export asks every time whether to include passport photos (on by default). Without them `includesPhotos` is false and `tables.photos` is empty: stamps keep their `photoId`, stays and Insights come back whole, but Review, which lists stamps by page, cannot show those stamps until the pages are added again. The import dialog says so.
- `settings` is an allow-list of the non-secret settings. The OpenRouter key and the voyput-local pairing token are never written; on import the current ones are kept. The theme and other per-device UI choices in localStorage are not part of the file.
- The file is built as a `Blob` from one string part per row group and per photo, so export never holds the whole file in one string, and photos are encoded one at a time with a yield in between.
- Import validates the whole file before it writes anything: format, version, `dbVersion`, every table present, every row's fields of the right type, dates real calendar days (a stamp's stored date may be one no traveller could have), photo location coordinates in range, unique keys, valid non-empty base64, and every reference inside the file kept: page → passport, stamp → passport and page, extraction → page (pages only when the file has photos), stay → stamps and photo locations. The message names the first bad row. Any failure is a `BackupError` with a message for the user, and nothing changes. Then the photos are decoded to `Blob`s (one at a time, yielding), and one Dexie `rw` transaction over all tables clears them and adds the rows; a failure inside it rolls back to the old data. Running extractions are cancelled first, as for Delete everything.
- `dbVersion` must equal the app's Dexie version (5). A backup from another version is rejected with a message naming both versions. This is the first version with backups, so no older backup exists yet. The first change that adds a Dexie version must also let backups of the previous version in: load them into a temporary database declared at their version and open it with `VoyputDb`, so the frozen upgrades of ADR 0039 run on them, then import its tables. A backup from a newer app is always rejected.
- Live queries refresh by themselves after the transaction; the Settings page remounts its cards so the profile shows the imported birth data. Stays are imported as stored; nothing derived is rebuilt.
- The date of the last export on this browser is kept in localStorage (`voyput:last-export`), not in the file.

## Alternatives

- An uncompressed zip with the photos as files: smaller and openable, but needs a zip writer and reader (or a dependency) and a JSON manifest anyway.
- Merging an import into the current data: needs id conflict rules for every table; replacing is what a restore or a move to another computer needs.

## Consequences

- A file with photos is about 4/3 of their size plus the rows; it is plain text, readable by anyone who gets it. The dialog tells the user so.
- Import reads the whole file into memory and parses it at once; very large libraries need memory for the text and the photos together.
- Measured on 2026-11-20 in headless Chromium on a synthetic library (30 photos of 2 MB, 200 stamps, 20,000 photo locations, 60 stays): export 3.5 s for an 84 MB file, import 1.4 s to read and check plus 2.1 s to write; the longest frame without a paint was about 0.6 s each way.
- Each new Dexie version must handle backups of the version before it (see above), or old backups stop importing.
