import { Button, Card, Dialog, PixelArt } from "@voyput/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserStorageKeeper as keeper } from "../data/storageKeeper";
import { useLiveQuery } from "../data/useLiveQuery";
import { useDb } from "../db/DbContext";
import { runsFor } from "../features/extract/runs";
import {
	type Backup,
	type BackupCounts,
	BackupError,
	type BackupSettings,
	backupFileName,
	backupStats,
	countsOfBackup,
	exportBackup,
	parseBackup,
	restoreBackup,
} from "./backup";
import { useSettings } from "./SettingsContext";

const LAST_EXPORT_KEY = "voyput:last-export";

function readLastExport(): string | null {
	try {
		return localStorage.getItem(LAST_EXPORT_KEY);
	} catch {
		return null;
	}
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
});
const formatDate = (iso: string): string => {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date);
};

/** "1.2 MB"; files under 100 kB read as "under 0.1 MB". */
export const formatSize = (bytes: number): string =>
	bytes < 100_000
		? "under 0.1 MB"
		: `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;

const count = (n: number, one: string, many = `${one}s`) =>
	`${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/** "2 passports, 30 page photos, …" */
export const describeCounts = (c: BackupCounts): string =>
	[
		count(c.passports, "passport"),
		count(c.photos, "page photo"),
		count(c.stamps, "stamp"),
		count(c.locations, "photo location"),
		count(c.stays, "stay"),
	].join(", ");

const messageOf = (failure: unknown): string =>
	failure instanceof BackupError
		? failure.message
		: `Something went wrong: ${failure instanceof Error ? failure.message : String(failure)}`;

function download(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Settings > Your data: export everything in this browser to one file, or
 * replace everything with such a file (ADR 0048). `onImported` gets the
 * imported settings, so the page can reload what it read once.
 */
export function DataCard({
	onImported,
}: {
	onImported: (settings: BackupSettings) => void;
}) {
	const db = useDb();
	const { settings, update } = useSettings();
	const [includePhotos, setIncludePhotos] = useState(true);
	const [busy, setBusy] = useState<"export" | "import" | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [lastExport, setLastExport] = useState(readLastExport);
	const [pending, setPending] = useState<Backup | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	// null: this browser cannot tell, so no storage line shows.
	const [kept, setKept] = useState<boolean | null>(null);
	const [refused, setRefused] = useState(false);
	useEffect(() => {
		let live = true;
		void keeper.persisted().then((value) => {
			if (live) setKept(value);
		});
		return () => {
			live = false;
		};
	}, []);
	const askToKeep = async () => {
		const granted = await keeper.persist();
		setKept((await keeper.persisted()) ?? granted);
		setRefused(granted !== true);
	};
	const statsQuery = useCallback(() => backupStats(db), [db]);
	const { data: stats } = useLiveQuery(statsQuery);

	const runExport = async () => {
		setBusy("export");
		setStatus(null);
		setError(null);
		try {
			const now = new Date();
			const blob = await exportBackup(db, { includePhotos, settings, now });
			download(blob, backupFileName(now));
			const at = now.toISOString();
			try {
				localStorage.setItem(LAST_EXPORT_KEY, at);
			} catch {
				// Not remembered; the export itself worked.
			}
			setLastExport(at);
			setStatus(
				`Saved ${backupFileName(now)} (${formatSize(blob.size)}) to your downloads.`,
			);
		} catch (failure) {
			setError(messageOf(failure));
		} finally {
			setBusy(null);
		}
	};

	const pick = async (file: File) => {
		setBusy("import");
		setStatus(null);
		setError(null);
		try {
			await db.open();
			setPending(parseBackup(await file.text(), db.verno));
		} catch (failure) {
			setError(messageOf(failure));
		} finally {
			setBusy(null);
		}
	};

	const confirmImport = async () => {
		const backup = pending;
		setPending(null);
		if (!backup) return;
		setBusy("import");
		try {
			runsFor(db).cancel();
			await restoreBackup(db, backup);
			update(backup.settings);
			onImported(backup.settings);
			setStatus(
				`Imported the backup of ${formatDate(backup.exportedAt)}: ${describeCounts(countsOfBackup(backup))}.`,
			);
		} catch (failure) {
			setError(`Nothing was changed. ${messageOf(failure)}`);
		} finally {
			setBusy(null);
		}
	};

	const total = stats
		? stats.rowBytes + (includePhotos ? stats.photoBytes : 0)
		: null;

	return (
		<Card
			title="Your data"
			art={<PixelArt name="suitcase" scale={3} />}
			description="Everything voyput keeps lives only in this browser. Save it to one file to keep a copy or move to another computer."
		>
			<div className="settings-data">
				<p className="settings-data-holds">
					{stats ? `This browser holds ${describeCounts(stats.counts)}.` : "…"}
				</p>
				{kept === true ? (
					<p className="vp-field-description">Storage: kept by the browser ✓</p>
				) : kept === false ? (
					<div className="settings-data-storage">
						<p className="vp-field-description">
							Storage: the browser may clear it when space runs low — export a
							backup
							{refused ? ". The browser did not agree to keep it." : null}
						</p>
						<Button onClick={askToKeep}>Ask the browser to keep it</Button>
					</div>
				) : null}
				<div className="settings-data-row">
					<div className="settings-data-text">
						<h3 className="settings-data-heading">Export</h3>
						<label className="settings-check">
							<input
								type="checkbox"
								checked={includePhotos}
								onChange={(event) => setIncludePhotos(event.target.checked)}
							/>
							Include passport photos
						</label>
						<span className="vp-field-description">
							{total === null ? "" : `File about ${formatSize(total)}. `}
							{lastExport
								? `Last export here: ${formatDate(lastExport)}.`
								: "Not exported from this browser yet."}
						</span>
					</div>
					<Button
						variant="primary"
						disabled={busy !== null}
						onClick={runExport}
					>
						{busy === "export" ? "Exporting…" : "Export"}
					</Button>
				</div>
				<div className="settings-data-row">
					<div className="settings-data-text">
						<h3 className="settings-data-heading">Import</h3>
						<span className="vp-field-description">
							Replaces everything in this browser with a backup file. You see
							what it holds before anything changes.
						</span>
					</div>
					<Button
						disabled={busy !== null}
						onClick={() => fileInput.current?.click()}
					>
						{busy === "import" ? "Reading…" : "Import…"}
					</Button>
					<input
						ref={fileInput}
						type="file"
						accept=".json,application/json"
						hidden
						aria-label="Backup file"
						onChange={(event) => {
							const file = event.target.files?.[0];
							event.target.value = "";
							if (file) void pick(file);
						}}
					/>
				</div>
				<p className="vp-field-description">
					The file is not encrypted: anyone with it can see your trips and
					passport pages. Your OpenRouter key and voyput-local pairing token are
					never in it.
				</p>
				{status ? <p role="status">{status}</p> : null}
				{error ? (
					<p role="alert" className="settings-data-error">
						{error}
					</p>
				) : null}
			</div>
			<Dialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open) setPending(null);
				}}
				title="Replace all your data?"
				actions={
					<>
						<Button onClick={() => setPending(null)}>Cancel</Button>
						<Button variant="danger" onClick={confirmImport}>
							Replace everything
						</Button>
					</>
				}
			>
				{pending ? (
					<>
						<p>
							<strong>Deleted from this browser:</strong>{" "}
							{stats ? describeCounts(stats.counts) : "everything stored"}.
						</p>
						<p>
							<strong>
								From the backup of {formatDate(pending.exportedAt)}:
							</strong>{" "}
							{describeCounts(countsOfBackup(pending))}, and its settings.
						</p>
						{pending.includesPhotos ? null : (
							<p>
								This file has no passport photos. Stamps and stays come back,
								but Review cannot show their pages until you add the photos
								again.
							</p>
						)}
						<p>This cannot be undone. Your key and pairing token stay.</p>
					</>
				) : null}
			</Dialog>
		</Card>
	);
}
