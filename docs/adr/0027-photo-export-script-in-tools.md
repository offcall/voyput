# ADR 0027: Photo Export Script in tools/

## Status

Accepted

## Context

The app imports iPhone photo locations from a CSV. Writing that CSV needs the Apple Photos library on a Mac, which a browser cannot read. A small Python script (osxphotos, offline reverse geocoding, run with `uv`) does it. It was written apart from the repo, and the app's "Get the script" link stayed hidden until it had a home.

## Decision

- The script lives in this repo at `tools/photos-export/` (one file `export_photo_locations.py` with inline `uv` dependencies, its README and pytest tests), not in a separate repository.
- It is Python, outside the npm workspaces: `npm run check` does not run it. Its tests run with `uv run --with pytest pytest` in that folder.
- The app links to the folder on GitHub (`EXPORT_SCRIPT_URL` in `features/import/csv/CsvImport.tsx`); the README shows a one-line download of the raw file.

## Consequences

- One repository to publish and to version together with the CSV format the app reads.
- A second language and toolchain in the repo, limited to `tools/`; a change to the CSV columns must update both the script and the app's parser.
- The raw download link works only once the repository is public.
