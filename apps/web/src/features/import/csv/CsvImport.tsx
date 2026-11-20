import {
	dayOf,
	type LocationRow,
	type LocationSummary,
	summarizeLocations,
} from "@voyput/core";
import {
	Button,
	Card,
	CommandBox,
	CountryChip,
	Dialog,
	Disclosure,
	Dropzone,
	Notice,
	Stat,
	StatGroup,
} from "@voyput/ui";
import { useCallback, useEffect, useState } from "react";
import { useCountryColour } from "../../../app/countryColours";
import { type ServedScript, verifiedCommand } from "../../../app/servedScripts";
import { staysAfterEvidenceChange } from "../../../data/evidenceChange";
import { keepStorageOnce } from "../../../data/storageKeeper";
import { useLiveQuery } from "../../../data/useLiveQuery";
import { useDb } from "../../../db/DbContext";
import type { VoyputDb } from "../../../db/db";
import { LocationStrip } from "./LocationStrip";
import {
	type AddResult,
	addLocationFile,
	addResultText,
	type LocationFile,
	listOnlyFile,
	locationFile,
	readLocationFiles,
	removeLocationFile,
} from "./locationFiles";
import {
	focusStoredLocations,
	locationLine,
	STORED_LOCATIONS_ID,
} from "./locationLine";
import { parseLocationFile } from "./parseLocations";
import { type StoredLocations, useStoredLocations } from "./storedLocations";

type ImportState =
	| { kind: "idle" }
	| { kind: "busy" }
	| { kind: "choose"; file: File }
	| { kind: "done"; summary: LocationSummary; skipped: number }
	| { kind: "added"; result: AddResult; skipped: number }
	| { kind: "demo"; summary: LocationSummary }
	| { kind: "error"; message: string };

/** What places a photo in a stay: its local day and country. */
const readingOf = (row: LocationRow) => `${dayOf(row)}|${row.countryCode}`;

/** What a new file does to stored locations (ADR 0050). */
type ImportMode = "replace" | "add";

/**
 * Parses the file. Replace swaps all stored locations for its rows in one
 * transaction: stored stays lose the photos the new file no longer has, and
 * are marked, as are stays whose photos now have another day or country.
 * Add keeps them and stores only the rows not there yet.
 */
async function importLocationCsv(
	db: VoyputDb,
	file: File,
	mode: ImportMode,
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
	const importedAt = new Date().toISOString();
	if (mode === "add")
		return {
			kind: "added",
			result: await addLocationFile(db, file.name, result.rows, importedAt),
			skipped: result.skipped,
		};
	const tables = [db.locations, db.stays, db.stamps, db.kv];
	await db.transaction("rw", tables, async () => {
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
		const uuids = result.rows.map((row) => row.uuid);
		await listOnlyFile(
			db,
			locationFile(file.name, result.rows, uuids, importedAt),
		);
	});
	void keepStorageOnce();
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
	const { data: stored } = useStoredLocations();

	const run = async (file: File, mode: ImportMode) => {
		setState({ kind: "busy" });
		try {
			const next = await importLocationCsv(db, file, mode);
			setState(next);
		} catch (error) {
			setState({
				kind: "error",
				message: `Could not import ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	};
	const onFiles = (files: File[]) => {
		const file = files[0];
		if (!file || state.kind === "busy") return;
		// With locations stored, the user says whether the file replaces or adds to them.
		if ((stored?.rowCount ?? 0) > 0) setState({ kind: "choose", file });
		else void run(file, "replace");
	};
	const choosing = state.kind === "choose" ? state.file : null;

	// After an import, move to what is stored once it shows (it is hidden while empty).
	const imported = state.kind === "done" || state.kind === "added";
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
					{hasRows ? <FileList /> : null}
				</section>
				<ImportStatus state={state} />
				<Dropzone
					accept=".csv,text/csv"
					label="Drop photo_locations.csv here or pick it"
					hint="With photo locations stored, you choose: the new file replaces them or adds to them."
					onFiles={onFiles}
				/>
				<Dialog
					open={choosing !== null}
					onOpenChange={(open) => {
						if (!open) setState({ kind: "idle" });
					}}
					title="Photo locations are already stored"
					actions={
						<>
							<Button onClick={() => setState({ kind: "idle" })}>Cancel</Button>
							<Button
								variant="danger"
								onClick={() => choosing && run(choosing, "replace")}
							>
								Replace
							</Button>
							<Button
								variant="primary"
								onClick={() => choosing && run(choosing, "add")}
							>
								Add to them
							</Button>
						</>
					}
				>
					<p>
						Replace them with {choosing?.name}, or add its photo locations that
						are not stored yet, for example from another library.
					</p>
				</Dialog>
				<HowToGetFile open={empty} />
			</div>
		</Card>
	);
}

const skippedText = (skipped: number) =>
	skipped > 0
		? ` Skipped ${skipped.toLocaleString("en")} rows with a bad date or coordinates, or no country.`
		: "";

function ImportStatus({ state }: { state: ImportState }) {
	switch (state.kind) {
		case "idle":
		case "choose":
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
					Imported {locationLine(summary)}.{skippedText(skipped)}
				</Notice>
			);
		}
		case "added":
			return (
				<Notice tone="good" role="status">
					{addResultText(state.result)}
					{skippedText(state.skipped)}
				</Notice>
			);
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
					In Terminal, run this. It downloads the script, checks it against this
					site and writes photo_locations.csv to your Desktop.
					<CommandBox
						command={exportCommand(origin)}
						label="Copy the export command"
					/>
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

const dayRange = (file: LocationFile) =>
	file.firstDay === file.lastDay
		? (file.firstDay ?? "–")
		: `${file.firstDay} to ${file.lastDay}`;

/** The imported files, each removable with the rows only it brought. */
function FileList() {
	const db = useDb();
	const { data: files } = useLiveQuery(
		useCallback(() => readLocationFiles(db), [db]),
	);
	const [removing, setRemoving] = useState<LocationFile | null>(null);
	if (!files || files.length === 0) return null;
	return (
		<>
			<ul className="import-files" aria-label="Imported files">
				{files.map((file) => (
					<li key={file.id}>
						<span className="import-file-name">{file.name}</span>
						<span className="import-file-meta">
							{file.rows.toLocaleString("en")} rows · {dayRange(file)}
							{file.importedAt
								? ` · imported ${file.importedAt.slice(0, 10)}`
								: ""}
						</span>
						<Button
							size="sm"
							variant="ghost"
							aria-label={`Remove ${file.name}`}
							onClick={() => setRemoving(file)}
						>
							Remove
						</Button>
					</li>
				))}
			</ul>
			<Dialog
				open={removing !== null}
				onOpenChange={(open) => {
					if (!open) setRemoving(null);
				}}
				title={`Remove ${removing?.name ?? "file"}?`}
				actions={
					<>
						<Button onClick={() => setRemoving(null)}>Cancel</Button>
						<Button
							variant="danger"
							onClick={async () => {
								const file = removing;
								setRemoving(null);
								if (file) await removeLocationFile(db, file.id);
							}}
						>
							Remove file
						</Button>
					</>
				}
			>
				<p>
					Its photo locations are deleted from this browser, except those
					another listed file also has.
				</p>
			</Dialog>
		</>
	);
}
