# photo-locations.sh

Exports where and when your photos and videos were taken, from the Apple
Photos library on your Mac, to `photo_locations.csv`. Import that file in
voyput as **iPhone photo locations** to check passport stamp dates against
where your phone actually was.

## Run

1. Give your terminal Full Disk Access: **System Settings > Privacy &
   Security > Full Disk Access**, turn on Terminal (or iTerm, ...; use **+**
   to add it). Quit the terminal completely and reopen it.
2. Copy the command from voyput (**Collect > iPhone photo locations > How
   to get this file**) and paste it. It has this shape:

   ```sh
   curl -fsSLo photo-locations.sh https://voyput.app.offcall.link/photo-locations.sh && echo "<sha256>  photo-locations.sh" | shasum -a 256 -c - && sh photo-locations.sh
   ```

   It downloads the script, checks it against the SHA-256 that this build of
   voyput was made with, and runs it only if they match. The hash comes from
   the same site, so this catches a corrupted or tampered script file, cache
   or proxy, not a takeover of the whole site
   ([ADR 0035](../../docs/adr/0035-download-verify-run.md)). The script stays
   in the current folder; delete it when you are done.

`photo_locations.csv` lands on your Desktop (replaced if it is there). Then in
voyput: **Collect > iPhone photo locations**, choose the file.

Nothing to install: plain POSIX `sh` and the `sqlite3` that ships with macOS.
It works the same whether your shell is zsh, bash or fish (`sh` runs it with
`/bin/sh`). Read it first if you like:
<https://voyput.app.offcall.link/photo-locations.sh>.

Options go after the script, for example once it is downloaded:

```sh
sh photo-locations.sh --since 2016-01-01
```

| Option | Meaning |
| --- | --- |
| `--out PATH` | CSV to write (default `~/Desktop/photo_locations.csv`); a folder gets `photo_locations.csv` inside it |
| `--library PATH` | Photos library (`.photoslibrary`) or its `Photos.sqlite`; default `~/Pictures/Photos Library.photoslibrary` |
| `--since YYYY-MM-DD` | Only photos taken on or after this day (local day of the photo) |
| `--until YYYY-MM-DD` | Only photos taken on or before this day |
| `--quiet` | Print errors only |

## Privacy

- Reads only the Photos database (`Photos.sqlite`) and creates no file in the
  library. With Photos closed it opens the database as immutable (no locks, no
  `-shm` or `-wal` file). With Photos open (`-wal` and `-shm` next to the
  database) it takes a snapshot with `sqlite3 .backup` into a temporary folder,
  or copies the files there when Photos locks out readers; the folder is
  deleted when it ends.
- Does not open your photo files, downloads nothing from iCloud, uploads
  nothing. The only output is the CSV, readable by you only (mode 0600).

## Output

UTF-8 CSV, header row (also when no photo matches), one row per photo or video with a location, oldest
first. Trashed items and items without a location (screenshots, saved images)
are left out.

| Column | Content |
| --- | --- |
| `date` | ISO 8601 in the photo's local time with its UTC offset, e.g. `2019-05-01T23:30:05+02:00`; UTC (`Z`) when Photos stored no time zone |
| `lat`, `lon` | Decimal degrees, 6 decimals |
| `is_video` | `true` or `false` |
| `filename` | Original file name, e.g. `IMG_0001.HEIC` |
| `uuid` | The item's id in the Photos library |

No country column: voyput finds each row's country from its coordinates when
you import, in your browser ([ADR 0033](../../docs/adr/0033-photo-export-in-plain-sh.md)).

## Troubleshooting

- **"macOS denied access"**: Full Disk Access as in step 1, then quit and
  reopen the terminal.
- **"Photos library not found"**: pass yours with `--library`. In Photos,
  Settings > General shows where it is.
- **"this macOS version is not supported yet"**: the Photos database differs
  between macOS versions; the script reads the `ZASSET` (Big Sur and later)
  and `ZGENERICASSET` (Catalina) tables. Please report the message.

## Tests

`npm run check` runs `test/photo-locations.test.ts`: it builds fixture
`Photos.sqlite` files in both table shapes with `sqlite3` and runs the script
with `/bin/sh`. They run on Linux; the real check is a run on a Mac.
