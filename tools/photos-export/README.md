# export_photo_locations

Exports where and when your photos and videos were taken from the Apple Photos
library on your Mac to `photo_locations.csv`. Import that file in
voyput as **iPhone photo locations** to check passport
stamp dates against where your phone actually was.

For each geotagged photo or video it writes the date, the coordinates, the
country and the city. The country comes from Apple's own place data. Photos
Apple has no place for get one from offline reverse geocoding of the
coordinates. At the end it prints a short summary per country.

## Privacy

- Reads only the local Photos database (`Photos.sqlite`) through
  [osxphotos](https://github.com/RhetTbull/osxphotos). It does not open or
  download your photo files and downloads nothing from iCloud.
- Geocoding runs offline with
  [reverse_geocoder](https://github.com/thampiman/reverse-geocoder).
- Nothing is uploaded. The only output is the CSV file on your disk.

## Requirements

- macOS with the Photos app and your library on this Mac. With iCloud Photos
  and "Optimize Mac Storage" turned on, locations are still stored locally.
- Full Disk Access for the terminal app you run the script from: **System
  Settings > Privacy & Security > Full Disk Access**. Turn on Terminal (or
  iTerm, Visual Studio Code, ...), using **+** to add it if it is not listed.
  Then quit that app completely and reopen it.
- [uv](https://docs.astral.sh/uv/). It installs Python 3.10+ and the
  dependencies (osxphotos, reverse_geocoder, pycountry, tqdm) by itself, in a
  temporary environment, the first time you run the script.

Install uv:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

or `brew install uv`.

## Get it

The script is one file. Download it into an empty folder:

```bash
curl -fsSLO https://raw.githubusercontent.com/offcall/voyput/main/tools/photos-export/export_photo_locations.py
```

or clone [offcall/voyput](https://github.com/offcall/voyput) and `cd tools/photos-export`.

## Run

```bash
uv run export_photo_locations.py
```

This writes `photo_locations.csv` to the current folder. If that file already
exists, it is replaced. A large library takes a few minutes to read.

Options:

| Option | Meaning |
| --- | --- |
| `--out PATH` | CSV file to write (default `./photo_locations.csv`) |
| `--library PATH` | Photos library (`.photoslibrary`) to read; default: the one Photos opened last |
| `--since YYYY-MM-DD` | Only photos taken on or after this day |
| `--until YYYY-MM-DD` | Only photos taken on or before this day |
| `--no-geocode` | Skip offline geocoding: faster, but photos Apple has no country for are left out |
| `--quiet` | Print errors only |

Example:

```bash
uv run export_photo_locations.py --since 2016-01-01 --out ~/Desktop/photo_locations.csv
```

## Output

UTF-8 CSV with a header row and one row per photo or video, oldest first:

| Column | Content |
| --- | --- |
| `date` | When it was taken, ISO 8601 in the photo's local time with its UTC offset, e.g. `2019-05-01T23:30:05+02:00` |
| `lat`, `lon` | Coordinates in decimal degrees (6 decimals) |
| `country_code` | ISO 3166-1 alpha-2 code, e.g. `FR` |
| `country` | Country name (same naming for Apple and geocoded rows) |
| `city` | City, from Apple or the geocoder; may be empty |
| `source` | `apple` or `offline`: where the country came from |
| `is_video` | `true` or `false` |
| `filename` | Original file name, e.g. `IMG_0001.HEIC` |
| `uuid` | The photo's id in the Photos library |

Photos without GPS (screenshots, saved images, ...), without a date, or
without a country are left out and counted in the summary.

## Import in voyput

Open voyput, go to **Collect > iPhone photo locations** and choose
`photo_locations.csv`.

## Troubleshooting

- **"macOS denied access"**: grant Full Disk Access as described in
  Requirements, then quit and reopen the terminal.
- **"Photos library not found"**: pass your library with `--library`, e.g.
  `--library "$HOME/Pictures/Photos Library.photoslibrary"`. In Photos,
  Settings > General shows where the library is.
- **"only runs on macOS"**: run it on the Mac that holds your Photos library.

## Tests

The pure logic (rows, country fallback, dates, CSV, summary) is tested with
fake photo objects and runs on any OS:

```bash
uv run --with pytest pytest
```
