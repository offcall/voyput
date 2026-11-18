# ADR 0041: Read-Only Photos Library Access

## Status

Accepted. Amends ADR 0033 (how `photo-locations.sh` reads `Photos.sqlite`).

## Context

ADR 0033 read `Photos.sqlite` with `sqlite3 -readonly`, or a temporary copy when Photos held it locked. On a WAL database, even a read-only connection creates `Photos.sqlite-shm` and `-wal` next to the database when they are missing, so the export wrote into the user's Photos library.

## Decision

`tools/photos-export/photo-locations.sh` never creates or changes a file inside the library:

- **Photos closed** (no `Photos.sqlite-wal` and no `-shm`): every row is in `Photos.sqlite`. It is opened through a SQLite URI with `mode=ro&immutable=1`: no locks, no new files.
- **Photos open** (`-wal` and `-shm` present): `sqlite3 "<uri>?mode=ro" ".backup <copy>"` with a 5-second busy timeout takes a consistent snapshot, recent `-wal` rows included, into a `mktemp -d` folder, and the export reads the snapshot.
- **Last resort**: when the snapshot fails with "locked" or "busy", or only one of `-wal` and `-shm` exists, `Photos.sqlite` and its `-wal` (if any) are copied into that folder and read there. Any other snapshot error stops the export.
- The temporary folder is removed by a `trap` on exit. The library path is URI-escaped (`%`, `?`, `#`).

## Consequences

- Running the export leaves the library as it was, whether Photos is open or closed.
- `immutable=1` trusts that nothing writes the database during the read. If Photos starts between the `-wal`/`-shm` check and the read, the export may read an inconsistent file. Not verified on a Mac, nor whether a background Photos process keeps the database open while the app is closed.
- The snapshot and the copy need free space in `$TMPDIR` for one copy of the database.
- Covered by the fixture tests in `photo-locations.test.ts`; not run against a real library here.
