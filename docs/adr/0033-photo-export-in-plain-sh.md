# ADR 0033: Photo Export in Plain sh

## Status

Accepted. Supersedes ADR 0027. Run command amended by ADR 0035 (download, verify, run). Outline source amended by ADR 0037 (map units).

## Context

ADR 0027 kept a Python export script in `tools/photos-export/`, run with `uv`. Its dependencies (osxphotos, reverse_geocoder, pycountry, tqdm) pulled 67 packages (pyobjc, scipy, numpy, ...) on a test Mac, too much for writing a CSV. Its raw GitHub download returned 404 while the repository was private. It also crashed there (Photos.sqlite read in text mode).

## Decision

- `tools/photos-export/photo-locations.sh`: POSIX `sh` plus the `sqlite3` that ships with macOS, nothing to install. Run as `curl -fsSL <site>/photo-locations.sh | sh`; the site serves the file (a Vite plugin, like `voyput-local.mjs` in ADR 0026), and Collect shows the command built from the page's origin.
- It reads `Photos.sqlite` read-only (`sqlite3 -readonly`), or a temporary copy when Photos holds it locked. Table `ZASSET` (Big Sur and later) or `ZGENERICASSET` (Catalina); `ZDATECREATED` (seconds since 2001-01-01 UTC), `ZLATITUDE`, `ZLONGITUDE`, `ZKIND`, `ZUUID`; trashed items and -180/-180 or NULL locations are left out. Local time and original file name come from `ZADDITIONALASSETATTRIBUTES` (`ZTIMEZONEOFFSET`, `ZORIGINALFILENAME`) when those columns exist, else UTC and `ZFILENAME`. A missing required column stops it with a "please report" message. Before SQLite, it reads 16 raw bytes so that a denied read (no Full Disk Access) gets its own message.
- The CSV becomes `date,lat,lon,is_video,filename,uuid`, written to `~/Desktop/photo_locations.csv` by default. `country_code` is optional for the app: `parseLocationCsv` takes a `CountryLocator`, and Collect builds one (`buildCountryLocator`) from Natural Earth 10m admin 0 outlines (public domain), every point kept, rounded to 1e-4° (~11 m). The 110m map outlines are not used: they lack Singapore, Hong Kong, Bahrain, Monaco, Andorra, the Maldives and more, and are kilometres off at borders. The point gets the outline it lies in (the smallest when outlines nest), else the nearest outline within 50 km (beaches, piers, boats), else the row is skipped. A `country_code` in the file still wins, so old exports and the demo keep their countries.
- The outlines are `apps/web/src/features/import/csv/assets/country-outlines.json` (4.4 MB, ~1.7 MB gzipped, per code a list of rings as integer deltas), written by `npm run world:outlines -- <ne_10m_admin_0_countries.geojson>`. They load in their own chunk on the first CSV import only. Areas Natural Earth leaves without a code are placed where a traveller is (Northern Cyprus and the UK bases CY, Somaliland SO); disputed glaciers, reefs and Bir Tawil fall to the nearest country. A latitude-band index (inside test) and a 0.25° grid (nearest edge) keep a lookup fast, and answers are cached per ~11 m.
- The tests run the script with `/bin/sh` against fixture databases in both table shapes inside `npm run check`; the Python script and its pytest tests are removed.

## Consequences

- One command, no Python, no packages; it works from zsh, bash or fish since `| sh` runs `/bin/sh`.
- Countries follow Natural Earth 10m: within a few hundred metres at borders, and coarser for the tiniest states (the Vatican's outline is a ~100 m box, so St Peter's Square reads as Italy). Every state and territory with an ISO code has an outline, Singapore, Hong Kong, Macau, Monaco and the Maldives included. Northern Cyprus counts as Cyprus.
- The first import downloads ~1.7 MB more (4.4 MB if the host does not gzip). Stays are reviewed by the user, who can correct them.
- The Photos schema varies by macOS version and cannot be run here; the fixtures follow the known column names, and the maintainer verifies on a Mac.
- No city or country name in the CSV.
