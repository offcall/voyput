import {
	dayOf,
	type LocationRow,
	type LocationSummary,
	summarizeLocations,
} from "@voyput/core";
import {
	Card,
	CountryChip,
	Disclosure,
	Dropzone,
	Notice,
	Stat,
	StatGroup,
} from "@voyput/ui";
import { useCallback, useEffect, useState } from "react";
import { useCountryColour } from "../../../app/countryColours";
import { type ServedScript, verifiedCommand } from "../../../app/servedScripts";
import { useDb } from "../../../db/DbContext";
import type { VoyputDb } from "../../../db/db";
import { staysAfterEvidenceChange } from "../../trips/evidenceChange";
import { useLiveQuery } from "../photos/useLiveQuery";
import { LocationStrip } from "./LocationStrip";
import {
	focusStoredLocations,
	locationLine,
	STORED_LOCATIONS_ID,
} from "./locationLine";
import { parseLocationFile } from "./parseLocations";
import {
	type StoredLocations,
	summarizeStoredLocations,
} from "./storedLocations";

type ImportState =
	| { kind: "idle" }
	| { kind: "busy" }
	| { kind: "done"; summary: LocationSummary; skipped: number }
	| { kind: "demo"; summary: LocationSummary }
	| { kind: "error"; message: string };

/** What places a photo in a stay: its local day and country. */
const readingOf = (row: LocationRow) => `${dayOf(row)}|${row.countryCode}`;

/**
 * Parses the file and replaces all stored locations in one transaction.
 * Stored stays lose the photos the new file no longer has, and are marked,
 * as are stays whose photos now have another day or country.
 */
async function importLocationCsv(
	db: VoyputDb,
	file: File,
): Promise<ImportState> {
	const result = await parseLocationFile(await file.text());
	if (!result.ok) {
		const problem =
			"missingColumns" in result
				? `is missing required columns: ${result.missingColumns.join(", ")}`
				: `could not be read: ${result.error}`;
		return {
			kind: "error",
			message: `${file.name} ${problem}. Nothing was changed.`,
		};
	}
	if (result.rows.length === 0) {
		return {
			kind: "error",
			message: `${file.name} has no valid rows (${result.skipped} skipped). Nothing was changed.`,
		};
	}
	await db.transaction("rw", db.locations, db.stays, db.stamps, async () => {
		const old = new Map(
			(await db.locations.toArray()).map((row) => [row.uuid, readingOf(row)]),
		);
		await db.locations.clear();
		await db.locations.bulkPut(result.rows);
		const changedPhotos = new Set<string>();
		for (const row of result.rows) {
			const was = old.get(row.uuid);
			old.delete(row.uuid);
			if (was !== undefined && was !== readingOf(row))
				changedPhotos.add(row.uuid);
		}
		const removedPhotos = new Set(old.keys());
		if (removedPhotos.size + changedPhotos.size > 0)
			await staysAfterEvidenceChange(db, { removedPhotos, changedPhotos });
	});
	return {
		kind: "done",
		summary: summarizeLocations(result.rows),
		skipped: result.skipped,
	};
}

/** A demo load; a new object for every load, so the card reports each one. */
export interface DemoLoaded {
	summary: LocationSummary;
}

/** Location CSV upload: photo_locations.csv from the Apple Photos export. */
export function CsvImport({
	demoLoaded = null,
}: {
	/** Latest demo load, reported here next to the summary it changed; null once demo data is removed. */
	demoLoaded?: DemoLoaded | null;
} = {}) {
	const db = useDb();
	const [state, setState] = useState<ImportState>({ kind: "idle" });
	useEffect(() => {
		setState((current) =>
			demoLoaded
				? { kind: "demo", summary: demoLoaded.summary }
				: current.kind === "demo"
					? { kind: "idle" }
					: current,
		);
	}, [demoLoaded]);
	const { data: stored } = useLiveQuery(
		useCallback(() => summarizeStoredLocations(db), [db]),
	);

	const onFiles = async (files: File[]) => {
		const file = files[0];
		if (!file || state.kind === "busy") return;
		setState({ kind: "busy" });
		try {
			const next = await importLocationCsv(db, file);
			setState(next);
		} catch (error) {
			setState({
				kind: "error",
				message: `Could not import ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	};

	// After an import, move to what is stored once it shows (it is hidden while empty).
	const imported = state.kind === "done";
	const hasRows = (stored?.rowCount ?? 0) > 0;
	useEffect(() => {
		if (imported && hasRows) focusStoredLocations();
	}, [imported, hasRows]);
	const empty = stored !== undefined && !hasRows;

	return (
		<Card>
			{/* Nothing imported yet: no empty summary, the how-to open across the card. */}
			<div className="import-csv" data-empty={empty || undefined}>
				<section
					id={STORED_LOCATIONS_ID}
					className="import-stored"
					tabIndex={-1}
					aria-label="Stored photo locations"
				>
					<StoredSummary stored={stored} />
				</section>
				<ImportStatus state={state} />
				<Dropzone
					accept=".csv,text/csv"
					label="Drop photo_locations.csv here or pick it"
					hint="A new file replaces the photo locations imported before."
					onFiles={onFiles}
				/>
				<HowToGetFile open={empty} />
			</div>
		</Card>
	);
}

function ImportStatus({ state }: { state: ImportState }) {
	switch (state.kind) {
		case "idle":
			return null;
		case "busy":
			return (
				<Notice tone="info" role="status">
					Importing…
				</Notice>
			);
		case "error":
			return (
				<Notice tone="bad" role="alert">
					{state.message}
				</Notice>
			);
		case "demo":
			return (
				<Notice tone="good" role="status">
					Demo photo locations loaded: {locationLine(state.summary)}.
				</Notice>
			);
		case "done": {
			const { summary, skipped } = state;
			return (
				<Notice tone="good" role="status">
					Imported {locationLine(summary)}.
					{skipped > 0
						? ` Skipped ${skipped.toLocaleString("en")} rows with a bad date or coordinates, or no country.`
						: ""}
				</Notice>
			);
		}
	}
}

/** The script the site serves from `tools/photos-export` (ADR 0033). */
export const EXPORT_SCRIPT = "photo-locations.sh" satisfies ServedScript;

/** The one-line export: downloaded from `origin`, checked, then run (ADR 0035). */
export function exportCommand(origin: string): string {
	return verifiedCommand(origin, EXPORT_SCRIPT, "sh");
}

/** Steps to write photo_locations.csv on a Mac with the export script. */
export function HowToGetFile({
	origin = window.location.origin,
	open = false,
}: {
	origin?: string;
	/** Open from the start, as when nothing is imported yet. */
	open?: boolean;
}) {
	return (
		<Disclosure summary="How to get this file" defaultOpen={open}>
			<p>
				A small script reads the Apple Photos library on your Mac and writes one
				row per photo or video with GPS coordinates. It needs nothing but macOS,
				downloads nothing from iCloud and sends nothing anywhere.{" "}
				<a href={`${origin}/${EXPORT_SCRIPT}`} target="_blank" rel="noreferrer">
					Read the script
				</a>
				.
			</p>
			<ol>
				<li>
					Give your terminal app Full Disk Access (System Settings → Privacy
					&amp; Security → Full Disk Access), so it can read the Photos library.
				</li>
				<li>
					In Terminal, run <code>{exportCommand(origin)}</code>. It writes
					photo_locations.csv to your Desktop.
				</li>
				<li>Import that CSV here: drop it above or pick it.</li>
			</ol>
			<p>
				Columns: <code>date</code>, <code>lat</code>, <code>lon</code>, and
				optionally <code>country_code</code>, <code>country</code>,{" "}
				<code>city</code>, <code>source</code>, <code>is_video</code>,{" "}
				<code>filename</code>, <code>uuid</code>. <code>date</code> is ISO 8601.
				Without <code>country_code</code>, voyput finds the country from the
				coordinates, here in your browser, using detailed borders (Natural Earth
				10m, accurate to a few hundred metres).
			</p>
		</Disclosure>
	);
}

/** What is stored now, so a reload still shows the imported history. */
function StoredSummary({ stored }: { stored: StoredLocations | undefined }) {
	const countryColor = useCountryColour();
	if (!stored) return null;
	if (stored.rowCount === 0)
		return (
			<p className="import-csv-empty">
				No photo locations stored yet. Trips and charts need them.
			</p>
		);
	const years =
		stored.firstDay && stored.lastDay
			? `${stored.firstDay.slice(0, 4)}–${stored.lastDay.slice(0, 4)}`
			: "–";
	return (
		<>
			<StatGroup>
				<Stat
					label="Photo locations"
					value={stored.rowCount.toLocaleString("en")}
					hint={
						stored.demoCount > 0
							? `incl. ${stored.demoCount.toLocaleString("en")} demo`
							: undefined
					}
				/>
				<Stat
					label="Period"
					value={years}
					hint={
						stored.firstDay
							? `${stored.firstDay} to ${stored.lastDay}`
							: undefined
					}
				/>
				<Stat label="Countries" value={stored.countryCount} />
				{/* Files from the export script have no cities. */}
				{stored.cityCount > 0 ? (
					<Stat label="Cities" value={stored.cityCount} />
				) : null}
			</StatGroup>
			<ul className="import-countries" aria-label="Stored countries">
				{stored.countries.map((country) => (
					<li key={country.code} title={`${country.rows} locations`}>
						<CountryChip
							code={country.code}
							name={country.name}
							colour={countryColor(country.code)}
						/>
					</li>
				))}
			</ul>
			<LocationStrip periods={stored.periods} />
		</>
	);
}
