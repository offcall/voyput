import {
	type LocationSummary,
	parseLocationCsv,
	summarizeLocations,
} from "@voyput/core";
import { Card, Dropzone } from "@voyput/ui";
import { useState } from "react";
import { useDb } from "../../../db/DbContext";
import type { VoyputDb } from "../../../db/db";

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
		<Card title="Location history (CSV)">
			<Dropzone
				accept=".csv,text/csv"
				label="Drop photo_locations.csv here or pick it"
				hint="A new file replaces the locations imported before."
				onFiles={onFiles}
			/>
			<ImportStatus state={state} />
			<HowToGetFile />
		</Card>
	);
}

function ImportStatus({ state }: { state: ImportState }) {
	switch (state.kind) {
		case "idle":
			return null;
		case "busy":
			return <p role="status">Importing…</p>;
		case "error":
			return <p role="alert">{state.message}</p>;
		case "done": {
			const { summary, skipped } = state;
			return (
				<p role="status">
					Imported {summary.rowCount} locations
					{summary.firstDay
						? ` from ${summary.firstDay} to ${summary.lastDay}`
						: ""}{" "}
					in {summary.countryCount} countries. Skipped {skipped} rows with a bad
					date or coordinates.
				</p>
			);
		}
	}
}

function HowToGetFile() {
	return (
		<details>
			<summary>How to get this file</summary>
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
					Columns: date, lat, lon, country_code, country, city, source,
					is_video, filename, uuid. date, lat, lon and country_code are
					required; date is ISO 8601.
				</li>
			</ol>
		</details>
	);
}
