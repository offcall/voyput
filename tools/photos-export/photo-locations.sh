#!/bin/sh
# voyput photo-locations: writes where and when your photos and videos were
# taken, read from the Apple Photos library on this Mac, to a CSV that voyput
# imports as "iPhone photo locations".
#
# Plain POSIX sh plus the sqlite3 that ships with macOS. Reads Photos.sqlite
# only, and creates no file in the library (a snapshot copy in a temporary
# folder while Photos is open); opens no photo file, downloads nothing from
# iCloud, uploads nothing.
#
#   sh photo-locations.sh
#   sh photo-locations.sh --since 2016-01-01
#
# voyput (Collect > iPhone photo locations) shows a one-line command that
# downloads this file, checks its SHA-256 and runs it (ADR 0035).
#
# See docs/adr/0033-photo-export-in-plain-sh.md.

set -eu

APPLE_EPOCH=978307200 # 2001-01-01T00:00:00Z, the Core Data reference date

usage() {
	cat <<'EOF'
photo-locations: export your Photos locations to a CSV for voyput.

Usage: sh photo-locations.sh [options]

  --out PATH          CSV to write (default ~/Desktop/photo_locations.csv,
                      replaced if it exists); a folder gets
                      photo_locations.csv inside it
  --library PATH      Photos library (.photoslibrary) or its Photos.sqlite
                      (default ~/Pictures/Photos Library.photoslibrary)
  --since YYYY-MM-DD  Only photos taken on or after this day
  --until YYYY-MM-DD  Only photos taken on or before this day
  --quiet             Print errors only
  --help              Show this text

Columns: date (local time with UTC offset), lat, lon, is_video, filename, uuid.
voyput finds the country of each row from its coordinates when you import.
EOF
}

die() {
	printf 'photo-locations: %s\n' "$1" >&2
	exit 1
}

say() {
	[ "$quiet" = 1 ] || printf '%s\n' "$1"
}

needs_value() {
	[ "$2" -ge 2 ] || die "$1 needs a value (see --help)"
}

library=""
since=""
until=""
out=""
quiet=0
while [ $# -gt 0 ]; do
	case $1 in
	--library) needs_value "$1" $#; library=$2; shift 2 ;;
	--library=*) library=${1#*=}; shift ;;
	--since) needs_value "$1" $#; since=$2; shift 2 ;;
	--since=*) since=${1#*=}; shift ;;
	--until) needs_value "$1" $#; until=$2; shift 2 ;;
	--until=*) until=${1#*=}; shift ;;
	--out) needs_value "$1" $#; out=$2; shift 2 ;;
	--out=*) out=${1#*=}; shift ;;
	-q | --quiet) quiet=1; shift ;;
	-h | --help) usage; exit 0 ;;
	*) die "unknown option: $1 (see --help)" ;;
	esac
done

# A day goes into the SQL text, so only this exact shape is accepted.
check_day() {
	case $2 in
	[12][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]) ;;
	*) die "$1 must be a day like 2019-05-31, got: $2" ;;
	esac
}
[ -z "$since" ] || check_day --since "$since"
[ -z "$until" ] || check_day --until "$until"

command -v sqlite3 >/dev/null 2>&1 ||
	die "sqlite3 not found. It ships with macOS; run this on the Mac that holds your Photos library."

if [ -z "$library" ]; then
	[ "$(uname -s)" = Darwin ] ||
		die "this reads the Apple Photos library and runs on macOS. Elsewhere, pass a Photos.sqlite with --library."
	library="$HOME/Pictures/Photos Library.photoslibrary"
fi
if [ -z "$out" ]; then
	if [ -d "$HOME/Desktop" ]; then out="$HOME/Desktop/photo_locations.csv"; else out="photo_locations.csv"; fi
fi
[ ! -d "$out" ] || out="${out%/}/photo_locations.csv"
out_dir=$(dirname -- "$out")
[ -d "$out_dir" ] || die "--out: folder $out_dir does not exist"

FULL_DISK_ACCESS="macOS denied access to the Photos library at $library.
Give your terminal Full Disk Access:
  System Settings > Privacy & Security > Full Disk Access,
  turn on the app you run this command from (Terminal, iTerm, ...;
  use the + button to add it if it is not listed).
Then quit that app completely, reopen it and run the command again."

[ -e "$library" ] || die "Photos library not found: $library
Pass the right one with --library, for example
  --library \"\$HOME/Pictures/Photos Library.photoslibrary\"
(in Photos: Settings > General shows the library location)."

if [ -d "$library" ]; then db="$library/database/Photos.sqlite"; else db=$library; fi

# Read a few raw bytes first: macOS answers "Operation not permitted" here
# when the terminal has no Full Disk Access. Bytes only, never decoded.
if ! error=$(head -c 16 -- "$db" 2>&1 >/dev/null); then
	case $error in
	*"not permitted"* | *"ermission denied"*) die "$FULL_DISK_ACCESS" ;;
	*) die "$library does not look like a Photos library (no database/Photos.sqlite inside).
Pass a .photoslibrary folder with --library." ;;
	esac
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/voyput-photos.XXXXXX")
trap 'rm -rf "$work"' EXIT
trap 'exit 130' INT TERM HUP

sql() {
	sqlite3 -batch "$source" "$1" </dev/null
}
probe="SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('ZASSET', 'ZGENERICASSET') ORDER BY name = 'ZASSET' DESC LIMIT 1;"

# A SQLite URI for the library's database. "%", "?" and "#" are escaped;
# the absolute path keeps "file://" from reading a host name.
case $db in /*) abs=$db ;; *) abs="$(pwd)/$db" ;; esac
uri="file://$(printf '%s' "$abs" | sed 's/%/%25/g; s/?/%3f/g; s/#/%23/g')"

# Nothing may be created in the library: even "sqlite3 -readonly" leaves
# Photos.sqlite-shm and -wal next to a WAL database. With no -wal or -shm
# there, Photos is closed and every row is in Photos.sqlite: read it as
# immutable (no locks, no new files). Otherwise Photos is open and recent
# rows sit in the -wal file: take a consistent snapshot with .backup through
# the files that already exist, or copy them when Photos locks out readers.
if [ ! -e "$db-wal" ] && [ ! -e "$db-shm" ]; then
	source="$uri?mode=ro&immutable=1"
else
	say "Photos is using its database; reading a temporary copy."
	copy="$work/Photos.sqlite"
	snapshot=0
	if [ -e "$db-wal" ] && [ -e "$db-shm" ]; then
		if error=$(sqlite3 -batch -cmd ".timeout 5000" "$uri?mode=ro" ".backup '$copy'" </dev/null 2>&1); then
			snapshot=1
		else
			case $error in
			*locked* | *busy*) ;;
			*) die "could not read the Photos database $db: $error" ;;
			esac
		fi
	fi
	if [ "$snapshot" = 0 ]; then
		rm -f -- "$copy"
		cp -- "$db" "$copy" || die "could not copy $db to $work."
		[ ! -e "$db-wal" ] || cp -- "$db-wal" "$copy-wal" || die "could not copy $db-wal to $work."
	fi
	source=$copy
fi
table=$(sql "$probe" 2>"$work/error") ||
	die "could not read the Photos database $db: $(cat "$work/error")"
[ -n "$table" ] || die "no photo table (ZASSET or ZGENERICASSET) in $db. Is it a Photos library database?"

has_column() {
	[ "$(sql "SELECT count(*) FROM pragma_table_info('$1') WHERE name = '$2';")" = 1 ]
}
for column in Z_PK ZDATECREATED ZLATITUDE ZLONGITUDE ZTRASHEDSTATE ZKIND ZUUID; do
	has_column "$table" "$column" ||
		die "this Photos database has no $table.$column; this macOS version is not supported yet. Please report it."
done

# Local time zone and original file name live in ZADDITIONALASSETATTRIBUTES.
# Without them, dates are UTC ("Z") and the file name is the library's own.
tz="NULL"
filename="a.ZFILENAME"
has_column "$table" ZFILENAME || filename="NULL"
join=""
if has_column ZADDITIONALASSETATTRIBUTES ZASSET; then
	join="LEFT JOIN ZADDITIONALASSETATTRIBUTES x ON x.ZASSET = a.Z_PK"
	! has_column ZADDITIONALASSETATTRIBUTES ZTIMEZONEOFFSET || tz="x.ZTIMEZONEOFFSET"
	! has_column ZADDITIONALASSETATTRIBUTES ZORIGINALFILENAME || filename="COALESCE(x.ZORIGINALFILENAME, $filename)"
fi

rows="SELECT
	strftime('%Y-%m-%dT%H:%M:%S', a.ZDATECREATED + $APPLE_EPOCH + COALESCE($tz, 0), 'unixepoch')
		|| CASE WHEN $tz IS NULL THEN 'Z'
			ELSE (CASE WHEN $tz < 0 THEN '-' ELSE '+' END)
				|| printf('%02d:%02d', abs($tz) / 3600, abs($tz) % 3600 / 60) END AS date,
	printf('%.6f', a.ZLATITUDE) AS lat,
	printf('%.6f', a.ZLONGITUDE) AS lon,
	CASE WHEN a.ZKIND = 1 THEN 'true' ELSE 'false' END AS is_video,
	COALESCE($filename, '') AS filename,
	COALESCE(a.ZUUID, '') AS uuid,
	a.ZDATECREATED AS taken
FROM $table a $join
WHERE COALESCE(a.ZTRASHEDSTATE, 0) = 0
	AND a.ZDATECREATED IS NOT NULL
	AND a.ZLATITUDE IS NOT NULL AND a.ZLONGITUDE IS NOT NULL
	AND NOT (a.ZLATITUDE = -180 AND a.ZLONGITUDE = -180)
	AND abs(a.ZLATITUDE) <= 90 AND abs(a.ZLONGITUDE) <= 180"
range="1 = 1"
[ -z "$since" ] || range="$range AND substr(date, 1, 10) >= '$since'"
[ -z "$until" ] || range="$range AND substr(date, 1, 10) <= '$until'"

say "Reading $db ..."
# The CSV says where you were and when: readable by you only (0600).
umask 077
partial="$out_dir/.photo_locations.$$.tmp"
trap 'rm -rf "$work" "$partial"' EXIT
printf 'date,lat,lon,is_video,filename,uuid\n' >"$work/rows.csv"
sqlite3 -batch -csv "$source" \
	"SELECT date, lat, lon, is_video, filename, uuid FROM ($rows) WHERE $range ORDER BY taken;" \
	</dev/null >>"$work/rows.csv" || die "could not read the photos from $db."
# sqlite3 ends CSV lines with CRLF; voyput reads either, LF keeps the file plain.
tr -d '\r' <"$work/rows.csv" >"$partial" || die "could not write $out."
mv -f -- "$partial" "$out" || die "could not write $out."

summary=$(sql "SELECT count(*) || ' ' || COALESCE(min(substr(date, 1, 10)), '-') || ' ' || COALESCE(max(substr(date, 1, 10)), '-') FROM ($rows) WHERE $range;")
all=$(sql "SELECT count(*) FROM $table a WHERE COALESCE(a.ZTRASHEDSTATE, 0) = 0;")
set -- $summary
say ""
say "Saved $1 photo locations to $out"
[ "$1" = 0 ] || say "  from $2 to $3"
say "  $((all - $1)) left out: no location (screenshots, saved images, ...)${since:+, before $since}${until:+, after $until}"
say ""
say "Next: in voyput, Collect > iPhone photo locations, choose this file."
say "voyput finds each photo's country from its coordinates in your browser."
