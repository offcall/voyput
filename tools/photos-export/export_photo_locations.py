# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "osxphotos; sys_platform == 'darwin'",
#     "reverse_geocoder",
#     "pycountry",
#     "tqdm",
# ]
# ///
"""Export the locations of the photos and videos in your iPhone/Mac Photos
library to a CSV file that voyput imports as "iPhone photo locations".

Reads only the local Photos database (Photos.sqlite) through osxphotos.
Nothing is downloaded from iCloud and nothing is uploaded anywhere.

Run:  uv run export_photo_locations.py --help
"""

from __future__ import annotations

import argparse
import csv
import os
import sqlite3
import sys
import tempfile
import time
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

# Columns voyput reads, in this order. The first four are required there.
COLUMNS = (
    "date",
    "lat",
    "lon",
    "country_code",
    "country",
    "city",
    "source",
    "is_video",
    "filename",
    "uuid",
)

SOURCE_APPLE = "apple"
SOURCE_OFFLINE = "offline"

# The offline city database is slow to load once and fast per lookup after,
# so coordinates go to the geocoder in large batches.
GEOCODE_BATCH = 2000

DEFAULT_LIBRARY = Path.home() / "Pictures" / "Photos Library.photoslibrary"

FULL_DISK_ACCESS_HELP = (
    "Give your terminal Full Disk Access:\n"
    "  System Settings > Privacy & Security > Full Disk Access,\n"
    "  turn on the app you run this command from (Terminal, iTerm, Visual Studio Code, ...;\n"
    "  use the + button to add it if it is not listed).\n"
    "Then quit that app completely, reopen it and run the command again."
)

Row = dict[str, Any]
Coordinates = tuple[float, float]


class ExportError(Exception):
    """A problem the user can fix; the message says how."""


# --------------------------------------------------------------------------
# Pure logic: no Photos library, no geocoder, no files except write_csv.
# --------------------------------------------------------------------------


@dataclass
class Counts:
    """What happened to every photo the library returned."""

    total: int = 0
    no_gps: int = 0
    no_date: int = 0
    outside_dates: int = 0
    no_country: int = 0
    by_source: dict[str, int] = field(default_factory=dict)


@dataclass
class CountrySummary:
    code: str
    name: str
    count: int
    first_day: str
    last_day: str


def normalize_date(value: datetime | None) -> str | None:
    """ISO 8601 date-time in the photo's own time zone, to the second.

    voyput reads the day as the first ten characters, so the local day of the
    photo is kept (no conversion to UTC).
    """
    if value is None:
        return None
    return value.replace(microsecond=0).isoformat()


def parse_day(text: str) -> date:
    """argparse type for --since/--until."""
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(
            f"{text!r} is not a date, use YYYY-MM-DD (for example 2019-05-31)"
        ) from None


def valid_coordinates(lat: object, lon: object) -> bool:
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return False
    if isinstance(lat, bool) or isinstance(lon, bool):
        return False
    return abs(lat) <= 90 and abs(lon) <= 180


def normalize_country_code(value: object) -> str:
    """Upper-case two-letter code, or "" when the value is not one."""
    if not isinstance(value, str):
        return ""
    code = value.strip().upper()
    return code if len(code) == 2 and code.isascii() and code.isalpha() else ""


def apple_place(photo: Any) -> tuple[str, str]:
    """(country code, city) from Apple's own place data, "" when missing."""
    place = getattr(photo, "place", None)
    if place is None:
        return "", ""
    code = normalize_country_code(getattr(place, "country_code", None))
    address = getattr(place, "address", None)
    city = getattr(address, "city", None) if address is not None else None
    return code, city.strip() if isinstance(city, str) else ""


def build_rows(
    photos: Iterable[Any],
    since: date | None = None,
    until: date | None = None,
    counts: Counts | None = None,
) -> tuple[list[Row], Counts]:
    """One row per photo with GPS and a date inside [since, until].

    Rows without an Apple country code get country_code "" and source "";
    fill them with apply_offline_places, then finish with finalize_rows.
    """
    counts = counts if counts is not None else Counts()
    first = since.isoformat() if since else None
    last = until.isoformat() if until else None
    rows: list[Row] = []
    for photo in photos:
        counts.total += 1
        location = getattr(photo, "location", None) or (None, None)
        lat, lon = location
        if not valid_coordinates(lat, lon):
            counts.no_gps += 1
            continue
        when = normalize_date(getattr(photo, "date", None))
        if when is None:
            counts.no_date += 1
            continue
        day = when[:10]
        if (first and day < first) or (last and day > last):
            counts.outside_dates += 1
            continue
        code, city = apple_place(photo)
        rows.append(
            {
                "date": when,
                "lat": round(float(lat), 6),
                "lon": round(float(lon), 6),
                "country_code": code,
                "country": "",
                "city": city,
                "source": SOURCE_APPLE if code else "",
                "is_video": bool(getattr(photo, "ismovie", False)),
                "filename": getattr(photo, "original_filename", None) or "",
                "uuid": getattr(photo, "uuid", None) or "",
            }
        )
    return rows, counts


def rows_needing_country(rows: Sequence[Row]) -> list[Row]:
    return [row for row in rows if not row["country_code"]]


def apply_offline_places(rows: Sequence[Row], results: Sequence[dict[str, Any]]) -> None:
    """Fills country code (and city, when Apple had none) from reverse_geocoder
    results, which come back in the same order as the rows."""
    if len(rows) != len(results):
        raise ValueError(f"{len(results)} geocoder results for {len(rows)} rows")
    for row, result in zip(rows, results):
        code = normalize_country_code(result.get("cc"))
        if not code:
            continue
        row["country_code"] = code
        row["source"] = SOURCE_OFFLINE
        name = result.get("name")
        if not row["city"] and isinstance(name, str):
            row["city"] = name.strip()


def finalize_rows(
    rows: Iterable[Row], country_name: Callable[[str], str], counts: Counts
) -> list[Row]:
    """Same country names for Apple and offline rows; drops rows that still
    have no country, because voyput needs a country code on every row."""
    kept: list[Row] = []
    for row in rows:
        if not row["country_code"]:
            counts.no_country += 1
            continue
        row["country"] = country_name(row["country_code"]) or row["country_code"]
        counts.by_source[row["source"]] = counts.by_source.get(row["source"], 0) + 1
        kept.append(row)
    kept.sort(key=lambda row: (row["date"], row["uuid"]))
    return kept


def csv_value(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def write_csv(rows: Iterable[Row], path: Path) -> None:
    """Writes the CSV atomically: an existing file is replaced only once the
    new one is complete."""
    path = Path(path)
    directory = path.parent if str(path.parent) else Path(".")
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle, lineterminator="\n")
            writer.writerow(COLUMNS)
            for row in rows:
                writer.writerow([csv_value(row[column]) for column in COLUMNS])
        os.replace(temp_name, path)
    except BaseException:
        Path(temp_name).unlink(missing_ok=True)
        raise


def summarize(rows: Iterable[Row]) -> list[CountrySummary]:
    """Per country: number of photos, first and last day; earliest visit first."""
    by_code: dict[str, CountrySummary] = {}
    for row in rows:
        day = row["date"][:10]
        entry = by_code.get(row["country_code"])
        if entry is None:
            by_code[row["country_code"]] = CountrySummary(
                row["country_code"], row["country"], 1, day, day
            )
            continue
        entry.count += 1
        entry.first_day = min(entry.first_day, day)
        entry.last_day = max(entry.last_day, day)
    return sorted(by_code.values(), key=lambda s: (s.first_day, s.name))


def format_report(path: Path, rows: Sequence[Row], counts: Counts, seconds: float) -> str:
    countries = summarize(rows)
    apple = counts.by_source.get(SOURCE_APPLE, 0)
    offline = counts.by_source.get(SOURCE_OFFLINE, 0)
    lines = [
        f"Saved {len(rows):,} photo locations to {path}",
        f"  country from Apple: {apple:,}, from offline geocoding: {offline:,}",
        f"  skipped: {counts.no_gps:,} without GPS (screenshots, saved images, ...)",
    ]
    if counts.no_date:
        lines.append(f"           {counts.no_date:,} without a date")
    if counts.outside_dates:
        lines.append(f"           {counts.outside_dates:,} outside --since/--until")
    if counts.no_country:
        lines.append(f"           {counts.no_country:,} without a country")
    lines.append(f"  took {seconds:.0f}s")
    if countries:
        noun = "country" if len(countries) == 1 else "countries"
        lines += ["", f"{len(countries)} {noun}:", ""]
        lines.append(f"{'Country':<32}{'Photos':>8}   {'First':<12}{'Last':<12}")
        lines.append("-" * 66)
        for c in countries:
            lines.append(
                f"{c.name[:31]:<32}{c.count:>8,}   {c.first_day:<12}{c.last_day:<12}"
            )
    lines += ["", "Next: import this file in voyput > Collect > iPhone photo locations."]
    return "\n".join(lines)


def ensure_macos(platform: str) -> None:
    if platform != "darwin":
        raise ExportError(
            "This script reads the Apple Photos library and only runs on macOS.\n"
            "Run it on the Mac that holds your Photos library (iCloud Photos synced to it)."
        )


def database_file(library: Path) -> Path:
    """Photos.sqlite inside a .photoslibrary bundle, or the file itself."""
    return library if library.is_file() else library / "database" / "Photos.sqlite"


def check_library(library: Path, opener: Callable[[Path], Any] = open) -> None:
    """Fails early with a clear message when the library is missing or macOS
    denies access (no Full Disk Access)."""
    if not library.exists():
        raise ExportError(
            f"Photos library not found: {library}\n"
            "Pass the right one with --library, for example\n"
            '  --library "$HOME/Pictures/Photos Library.photoslibrary"\n'
            "(in Photos: Settings > General shows the library location)."
        )
    db = database_file(library)
    try:
        with opener(db) as handle:
            handle.read(16)
    except PermissionError:
        raise ExportError(
            f"macOS denied access to the Photos library at {library}.\n" + FULL_DISK_ACCESS_HELP
        ) from None
    except FileNotFoundError:
        raise ExportError(
            f"{library} does not look like a Photos library (no {db.name} inside).\n"
            "Pass a .photoslibrary folder with --library."
        ) from None


# --------------------------------------------------------------------------
# Side effects: Photos library, geocoder, country names.
# --------------------------------------------------------------------------


def find_library(explicit: Path | None) -> Path:
    if explicit is not None:
        return explicit.expanduser()
    try:
        from osxphotos.utils import get_last_library_path, get_system_library_path

        found = get_last_library_path() or get_system_library_path()
    except Exception:  # noqa: BLE001 - fall back to the usual place
        found = None
    return Path(found) if found else DEFAULT_LIBRARY


def load_photos(library: Path) -> list[Any]:
    import osxphotos

    try:
        return list(osxphotos.PhotosDB(dbfile=str(library)).photos())
    except PermissionError:
        raise ExportError(
            f"macOS denied access to the Photos library at {library}.\n" + FULL_DISK_ACCESS_HELP
        ) from None
    except sqlite3.Error as error:
        raise ExportError(
            f"Could not read the Photos database at {library}: {error}\n"
            "If Photos is upgrading the library, open Photos once and wait until it is done.\n"
            "If the message mentions authorization or permission:\n" + FULL_DISK_ACCESS_HELP
        ) from None


def offline_lookup(coordinates: Sequence[Coordinates]) -> list[dict[str, Any]]:
    import reverse_geocoder

    # mode=1: single process; the multiprocess mode is unreliable on macOS.
    return list(reverse_geocoder.search(list(coordinates), mode=1, verbose=False))


def pycountry_name(code: str) -> str:
    import pycountry

    country = pycountry.countries.get(alpha_2=code)
    return country.name if country else code


def geocode(rows: Sequence[Row], quiet: bool) -> None:
    from tqdm import tqdm

    if not quiet:
        print(
            f"Offline geocoding {len(rows):,} photos Apple has no country for "
            "(the first batch loads the city database and takes longer)...",
            file=sys.stderr,
            flush=True,
        )
    with tqdm(total=len(rows), desc="Geocoding", unit="photo", disable=quiet) as bar:
        for start in range(0, len(rows), GEOCODE_BATCH):
            chunk = rows[start : start + GEOCODE_BATCH]
            results = offline_lookup([(row["lat"], row["lon"]) for row in chunk])
            apply_offline_places(chunk, results)
            bar.update(len(chunk))


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Export the locations of your Photos library to a CSV for voyput "
            "(Collect > iPhone photo locations). Reads the local library only; "
            "nothing is downloaded from iCloud or uploaded."
        )
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("photo_locations.csv"),
        metavar="PATH",
        help="CSV file to write (default: ./photo_locations.csv, replaced if it exists)",
    )
    parser.add_argument(
        "--library",
        type=Path,
        metavar="PATH",
        help="Photos library (.photoslibrary) to read (default: the one Photos opened last)",
    )
    parser.add_argument("--since", type=parse_day, metavar="YYYY-MM-DD", help="only photos taken on or after this day")
    parser.add_argument("--until", type=parse_day, metavar="YYYY-MM-DD", help="only photos taken on or before this day")
    parser.add_argument(
        "--no-geocode",
        action="store_true",
        help="skip offline geocoding; photos Apple has no country for are left out",
    )
    parser.add_argument("--quiet", action="store_true", help="print errors only")
    args = parser.parse_args(argv)
    if args.since and args.until and args.since > args.until:
        parser.error("--since is after --until")
    if not args.out.parent.is_dir():
        parser.error(f"--out: folder {args.out.parent} does not exist")
    return args


def run(args: argparse.Namespace) -> None:
    ensure_macos(sys.platform)
    from tqdm import tqdm

    started = time.monotonic()
    library = find_library(args.library)
    check_library(library)

    def say(message: str) -> None:
        if not args.quiet:
            print(message, file=sys.stderr, flush=True)

    say(f"Reading the Photos library {library}\n(a large library can take 1-3 minutes)...")
    photos = load_photos(library)
    say(f"Found {len(photos):,} photos and videos in {time.monotonic() - started:.0f}s.")

    rows, counts = build_rows(
        tqdm(photos, desc="Reading locations", unit="photo", disable=args.quiet),
        since=args.since,
        until=args.until,
    )
    missing = rows_needing_country(rows)
    if missing and not args.no_geocode:
        geocode(missing, args.quiet)
    rows = finalize_rows(rows, pycountry_name, counts)

    try:
        write_csv(rows, args.out)
    except OSError as error:
        raise ExportError(f"Could not write {args.out}: {error.strerror or error}") from None

    if not args.quiet:
        print()
        print(format_report(args.out, rows, counts, time.monotonic() - started))


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        run(args)
    except ExportError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nStopped; nothing was written.", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
