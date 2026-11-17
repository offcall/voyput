# ADR 0033: Photo Export in Plain sh

## Status

Accepted. Supersedes ADR 0027.

## Context

ADR 0027 kept a Python export script in `tools/photos-export/`, run with `uv`. Its dependencies (osxphotos, reverse_geocoder, pycountry, tqdm) pulled 67 packages (pyobjc, scipy, numpy, ...) on a test Mac, too much for writing a CSV. Its raw GitHub download returned 404 while the repository was private. It also crashed there (Photos.sqlite read in text mode).

## Decision

- `tools/photos-export/photo-locations.sh`: POSIX `sh` plus the `sqlite3` that ships with macOS, nothing to install. Run as `curl -fsSL <site>/photo-locations.sh | sh`; the site serves the file (a Vite plugin, like `voyput-local.mjs` in ADR 0026), and Collect shows the command built from the page's origin.
- It reads `Photos.sqlite` read-only (`sqlite3 -readonly`), or a temporary copy when Photos holds it locked. Table `ZASSET` (Big Sur and later) or `ZGENERICASSET` (Catalina); `ZDATECREATED` (seconds since 2001-01-01 UTC), `ZLATITUDE`, `ZLONGITUDE`, `ZKIND`, `ZUUID`; trashed items and -180/-180 or NULL locations are left out. Local time and original file name come from `ZADDITIONALASSETATTRIBUTES` (`ZTIMEZONEOFFSET`, `ZORIGINALFILENAME`) when those columns exist, else UTC and `ZFILENAME`. A missing required column stops it with a "please report" message. Before SQLite, it reads 16 raw bytes so that a denied read (no Full Disk Access) gets its own message.
- The CSV becomes `date,lat,lon,is_video,filename,uuid`, written to `~/Desktop/photo_locations.csv` by default. `country_code` is optional for the app: `parseLocationCsv` takes a `CountryLocator`, and Collect builds one from the Natural Earth 110m outlines the app already ships (`buildCountryLocator`): the outline containing the point, else the nearest outline within 50 km (coasts, small islands), else the row is skipped. A `country_code` in the file still wins, so old exports and the demo keep their countries.
- The tests run the script with `/bin/sh` against fixture databases in both table shapes inside `npm run check`; the Python script and its pytest tests are removed.

## Consequences

- One command, no Python, no packages; it works from zsh, bash or fish since `| sh` runs `/bin/sh`.
- Countries are coarser than Apple's or a geocoder's: points near a border can land in the neighbour, and places missing from the 110m map are not found: Singapore, Hong Kong, Bahrain, Monaco, Andorra, Mauritius, the Maldives and others. Their photos fall to the nearest outline within 50 km (Singapore becomes Malaysia, Hong Kong China, Monaco France) or are skipped (the Maldives). Stays are reviewed by the user, who can correct them.
- The Photos schema varies by macOS version and cannot be run here; the fixtures follow the known column names, and the maintainer verifies on a Mac.
- No city or country name in the CSV.
