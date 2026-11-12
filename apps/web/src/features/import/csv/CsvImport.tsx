import {
	countryColor,
	type LocationSummary,
	parseLocationCsv,
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
import { useCallback, useState } from "react";
import { useDb } from "../../../db/DbContext";
import type { VoyputDb } from "../../../db/db";
import { useLiveQuery } from "../photos/useLiveQuery";
import {
	type StoredLocations,
	summarizeStoredLocations,
} from "./storedLocations";

type ImportState =
	| { kind: "idle" }
	| { kind: "busy" }
	| { kind: "done"; summary: LocationSummary; skipped: number }
	| { kind: "error"; message: string };

/** Parses the file and replaces all stored locations in one transaction. */
async function importLocationCsv(
	db: VoyputDb,
	file: File,
): Promise<ImportState> {
	const result = parseLocationCsv(await file.text());
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
	await db.transaction("rw", db.locations, async () => {
		await db.locations.clear();
		await db.locations.bulkPut(result.rows);
	});
	return {
		kind: "done",
		summary: summarizeLocations(result.rows),
		skipped: result.skipped,
	};
}

/** Location CSV upload: photo_locations.csv from the Apple Photos export. */
export function CsvImport() {
	const db = useDb();
	const [state, setState] = useState<ImportState>({ kind: "idle" });
	const { data: stored } = useLiveQuery(
		useCallback(() => summarizeStoredLocations(db), [db]),
	);

	const onFiles = async (files: File[]) => {
		const file = files[0];
		if (!file || state.kind === "busy") return;
		setState({ kind: "busy" });
		try {
			setState(await importLocationCsv(db, file));
		} catch (error) {
			setState({
				kind: "error",
				message: `Could not import ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	};

	return (
		<Card
			title="Location history (CSV)"
			description="Where your photos were taken, from the Apple Photos library."
		>
			<div className="import-csv">
				<StoredSummary stored={stored} />
				<Dropzone
					accept=".csv,text/csv"
					label="Drop photo_locations.csv here or pick it"
					hint="A new file replaces the locations imported before."
					onFiles={onFiles}
				/>
				<ImportStatus state={state} />
				<HowToGetFile />
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
		case "done": {
			const { summary, skipped } = state;
			return (
				<Notice tone="good" role="status">
					Imported {summary.rowCount} locations
					{summary.firstDay
						? ` from ${summary.firstDay} to ${summary.lastDay}`
						: ""}{" "}
					in {summary.countryCount} countries. Skipped {skipped} rows with a bad
					date or coordinates.
				</Notice>
			);
		}
	}
}

function HowToGetFile() {
	return (
		<Disclosure summary="How to get this file">
			<p>
				The file comes from the Apple Photos library on a Mac. It lists every
				photo and video that has GPS coordinates; nothing is downloaded from
				iCloud.
			</p>
			<ol>
				<li>
					On macOS, give your terminal app Full Disk Access (System Settings →
					Privacy &amp; Security → Full Disk Access), so it can read the Photos
					library.
				</li>
				<li>
					Read the library with osxphotos and write one row per geotagged photo
					to photo_locations.csv. Photos without GPS are left out.
				</li>
				<li>
					Columns: <code>date</code>, <code>lat</code>, <code>lon</code>,{" "}
					<code>country_code</code>, <code>country</code>, <code>city</code>,{" "}
					<code>source</code>, <code>is_video</code>, <code>filename</code>,{" "}
					<code>uuid</code>. The first four are required; <code>date</code> is
					ISO 8601.
				</li>
			</ol>
		</Disclosure>
	);
}

/** What is stored now, so a reload still shows the imported history. */
function StoredSummary({ stored }: { stored: StoredLocations | undefined }) {
	if (!stored) return null;
	if (stored.rowCount === 0)
		return (
			<p className="import-csv-empty">
				No locations stored yet. Trips and charts need them.
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
					label="Locations"
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
				<Stat label="Cities" value={stored.cityCount} />
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
		</>
	);
}
