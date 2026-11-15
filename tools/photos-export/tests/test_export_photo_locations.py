import argparse
import csv
import io
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

import export_photo_locations as ex

PLUS_2 = timezone(timedelta(hours=2))


@dataclass
class FakePhoto:
    location: tuple[Any, Any] = (48.8584, 2.2945)
    date: datetime | None = datetime(2019, 5, 1, 23, 30, 5, 123456, tzinfo=PLUS_2)
    place: Any = None
    ismovie: bool = False
    original_filename: str = "IMG_0001.HEIC"
    uuid: str = "uuid-1"


def place(code: str | None, city: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(country_code=code, address=SimpleNamespace(city=city))


NAMES = {"FR": "France", "KR": "Korea, Republic of", "DE": "Germany"}


def name(code: str) -> str:
    return NAMES.get(code, "")


# --- dates -----------------------------------------------------------------


def test_normalize_date_keeps_local_day_and_offset_drops_microseconds():
    value = datetime(2019, 5, 1, 23, 30, 5, 123456, tzinfo=PLUS_2)
    assert ex.normalize_date(value) == "2019-05-01T23:30:05+02:00"


def test_normalize_date_naive_and_missing():
    assert ex.normalize_date(datetime(2020, 1, 2, 3, 4, 5)) == "2020-01-02T03:04:05"
    assert ex.normalize_date(None) is None


def test_parse_day():
    assert ex.parse_day("2019-05-31") == date(2019, 5, 31)
    with pytest.raises(argparse.ArgumentTypeError, match="YYYY-MM-DD"):
        ex.parse_day("31.05.2019")


# --- rows ------------------------------------------------------------------


def test_build_rows_uses_apple_place():
    rows, counts = ex.build_rows([FakePhoto(place=place("fr", " Paris "), ismovie=True)])
    assert rows == [
        {
            "date": "2019-05-01T23:30:05+02:00",
            "lat": 48.8584,
            "lon": 2.2945,
            "country_code": "FR",
            "country": "",
            "city": "Paris",
            "source": "apple",
            "is_video": True,
            "filename": "IMG_0001.HEIC",
            "uuid": "uuid-1",
        }
    ]
    assert counts.total == 1


def test_build_rows_without_apple_country_waits_for_geocoding():
    rows, _ = ex.build_rows([FakePhoto(place=None), FakePhoto(place=place("", None))])
    assert [(r["country_code"], r["source"], r["city"]) for r in rows] == [("", "", "")] * 2
    assert ex.rows_needing_country(rows) == rows


def test_build_rows_skips_photos_without_gps_or_date():
    photos = [
        FakePhoto(location=(None, None)),
        FakePhoto(location=None),
        FakePhoto(location=(91.0, 0.0)),
        FakePhoto(location=(0.0, -180.5)),
        FakePhoto(location=(True, 1.0)),
        FakePhoto(date=None),
    ]
    rows, counts = ex.build_rows(photos)
    assert rows == []
    assert (counts.total, counts.no_gps, counts.no_date) == (6, 5, 1)


def test_build_rows_date_filter_is_inclusive_on_the_local_day():
    photos = [
        FakePhoto(date=datetime(2019, 4, 30, 23, 59, tzinfo=PLUS_2), uuid="before"),
        FakePhoto(date=datetime(2019, 5, 1, 0, 1, tzinfo=PLUS_2), uuid="first"),
        FakePhoto(date=datetime(2019, 5, 31, 23, 59, tzinfo=PLUS_2), uuid="last"),
        FakePhoto(date=datetime(2019, 6, 1, 0, 0, tzinfo=PLUS_2), uuid="after"),
    ]
    rows, counts = ex.build_rows(photos, since=date(2019, 5, 1), until=date(2019, 5, 31))
    assert [r["uuid"] for r in rows] == ["first", "last"]
    assert counts.outside_dates == 2


def test_build_rows_rounds_coordinates():
    rows, _ = ex.build_rows([FakePhoto(location=(1.123456789, -2.987654321))])
    assert (rows[0]["lat"], rows[0]["lon"]) == (1.123457, -2.987654)


# --- country fallback ------------------------------------------------------


def test_apply_offline_places_fills_country_and_missing_city_only():
    rows, _ = ex.build_rows(
        [FakePhoto(place=place(None, "Kept City"), uuid="a"), FakePhoto(uuid="b")]
    )
    ex.apply_offline_places(rows, [{"cc": "de", "name": "Berlin"}, {"cc": "FR", "name": "Paris"}])
    assert [(r["country_code"], r["city"], r["source"]) for r in rows] == [
        ("DE", "Kept City", "offline"),
        ("FR", "Paris", "offline"),
    ]


def test_apply_offline_places_ignores_bad_codes_and_checks_length():
    rows, _ = ex.build_rows([FakePhoto()])
    ex.apply_offline_places(rows, [{"cc": "", "name": "Nowhere"}])
    assert (rows[0]["country_code"], rows[0]["source"]) == ("", "")
    with pytest.raises(ValueError):
        ex.apply_offline_places(rows, [])


def test_finalize_rows_names_countries_drops_rows_without_country_sorts_by_date():
    rows, counts = ex.build_rows(
        [
            FakePhoto(place=place("KR"), uuid="late", date=datetime(2020, 1, 1)),
            FakePhoto(place=None, uuid="no-country"),
            FakePhoto(place=place("XK"), uuid="early", date=datetime(2018, 1, 1)),
        ]
    )
    kept = ex.finalize_rows(rows, name, counts)
    assert [(r["uuid"], r["country"]) for r in kept] == [
        ("early", "XK"),
        ("late", "Korea, Republic of"),
    ]
    assert counts.no_country == 1
    assert counts.by_source == {"apple": 2}


def test_normalize_country_code():
    assert ex.normalize_country_code(" fr ") == "FR"
    for bad in ("", "FRA", "F1", None, 12, "ÄÖ"):
        assert ex.normalize_country_code(bad) == ""


# --- CSV -------------------------------------------------------------------


def exported(tmp_path: Path) -> tuple[Path, list[dict]]:
    rows, counts = ex.build_rows(
        [
            FakePhoto(place=place("KR", "Seoul"), ismovie=True, uuid="v"),
            FakePhoto(place=place("FR", 'Say "Paris"'), uuid="p", date=datetime(2018, 3, 4, 5, 6, 7)),
        ]
    )
    rows = ex.finalize_rows(rows, name, counts)
    path = tmp_path / "photo_locations.csv"
    ex.write_csv(rows, path)
    return path, rows


def test_write_csv_matches_what_voyput_reads(tmp_path):
    path, _ = exported(tmp_path)
    text = path.read_text(encoding="utf-8")
    assert text.splitlines()[0] == ",".join(ex.COLUMNS)
    assert "\r" not in text
    parsed = list(csv.DictReader(io.StringIO(text)))
    assert parsed == [
        {
            "date": "2018-03-04T05:06:07",
            "lat": "48.8584",
            "lon": "2.2945",
            "country_code": "FR",
            "country": "France",
            "city": 'Say "Paris"',
            "source": "apple",
            "is_video": "false",
            "filename": "IMG_0001.HEIC",
            "uuid": "p",
        },
        {
            "date": "2019-05-01T23:30:05+02:00",
            "lat": "48.8584",
            "lon": "2.2945",
            "country_code": "KR",
            "country": "Korea, Republic of",
            "city": "Seoul",
            "source": "apple",
            "is_video": "true",
            "filename": "IMG_0001.HEIC",
            "uuid": "v",
        },
    ]
    assert '"Korea, Republic of"' in text


def test_write_csv_replaces_existing_file_and_leaves_no_temp_files(tmp_path):
    path = tmp_path / "photo_locations.csv"
    path.write_text("old", encoding="utf-8")
    ex.write_csv([], path)
    assert path.read_text(encoding="utf-8") == ",".join(ex.COLUMNS) + "\n"
    assert [p.name for p in tmp_path.iterdir()] == ["photo_locations.csv"]


# --- summary ---------------------------------------------------------------


def test_summarize_and_report(tmp_path):
    path, rows = exported(tmp_path)
    assert ex.summarize(rows) == [
        ex.CountrySummary("FR", "France", 1, "2018-03-04", "2018-03-04"),
        ex.CountrySummary("KR", "Korea, Republic of", 1, "2019-05-01", "2019-05-01"),
    ]
    counts = ex.Counts(no_gps=3, by_source={"apple": 2})
    report = ex.format_report(path, rows, counts, 12.0)
    assert f"Saved 2 photo locations to {path}" in report
    assert "3 without GPS" in report
    assert "2 countries:" in report
    assert "iPhone photo locations" in report


# --- environment checks ----------------------------------------------------


def test_ensure_macos():
    ex.ensure_macos("darwin")
    with pytest.raises(ex.ExportError, match="only runs on macOS"):
        ex.ensure_macos("linux")


def test_check_library_missing(tmp_path):
    with pytest.raises(ex.ExportError, match="Photos library not found"):
        ex.check_library(tmp_path / "nope.photoslibrary")


def test_check_library_not_a_library(tmp_path):
    with pytest.raises(ex.ExportError, match="does not look like a Photos library"):
        ex.check_library(tmp_path)


def test_check_library_permission_denied_explains_full_disk_access(tmp_path):
    def denied(_path):
        raise PermissionError("Operation not permitted")

    with pytest.raises(ex.ExportError, match="Privacy & Security > Full Disk Access"):
        ex.check_library(tmp_path, opener=denied)


def test_check_library_reads_photos_sqlite(tmp_path):
    db = tmp_path / "database" / "Photos.sqlite"
    db.parent.mkdir()
    db.write_bytes(b"SQLite format 3\x00")
    ex.check_library(tmp_path)
    assert ex.database_file(tmp_path) == db
    assert ex.database_file(db) == db


def test_parse_args_defaults_and_errors(tmp_path, capsys):
    args = ex.parse_args([])
    assert (args.out, args.library, args.since, args.no_geocode, args.quiet) == (
        Path("photo_locations.csv"),
        None,
        None,
        False,
        False,
    )
    with pytest.raises(SystemExit):
        ex.parse_args(["--since", "2020-01-02", "--until", "2020-01-01"])
    with pytest.raises(SystemExit):
        ex.parse_args(["--out", str(tmp_path / "missing" / "x.csv")])
    assert "does not exist" in capsys.readouterr().err
