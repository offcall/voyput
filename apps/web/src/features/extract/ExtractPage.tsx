import { Link } from "@tanstack/react-router";
import {
	type Conflict,
	findConflicts,
	type Passport,
	type PhotoExtraction,
	pairVisits,
	type Stamp,
} from "@voyput/core";
import {
	Badge,
	Button,
	Card,
	Dialog,
	EmptyState,
	PageHeader,
	PixelArt,
	Progress,
	Stack,
	Toolbar,
	ToolbarSpacer,
} from "@voyput/ui";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useAi } from "../../ai/AiContext";
import { useDb } from "../../db/DbContext";
import type { PhotoRecord } from "../../db/db";
import { useSettings } from "../../settings/SettingsContext";
import { extractPhoto } from "./extractPhoto";
import { runsFor } from "./runs";
import "./extract.css";

interface PassportData {
	/** The passport these photos and stamps belong to. */
	passportId: string;
	photos: PhotoRecord[];
	extractions: Map<string, PhotoExtraction>;
	stamps: Stamp[];
}

const EMPTY: PassportData = {
	passportId: "",
	photos: [],
	extractions: new Map(),
	stamps: [],
};

export function ExtractPage() {
	const db = useDb();
	const ai = useAi();
	const { settings } = useSettings();
	const [passports, setPassports] = useState<Passport[]>([]);
	const [passportId, setPassportId] = useState("");
	const [data, setData] = useState<PassportData>(EMPTY);
	const [reextract, setReextract] = useState<PhotoRecord | null>(null);
	const runs = runsFor(db);
	const { active, progress } = useSyncExternalStore(
		runs.subscribe,
		runs.snapshot,
	);

	useEffect(() => {
		void db.passports.toArray().then((all) => {
			setPassports(all);
			setPassportId((current) => current || (all[0]?.id ?? ""));
		});
	}, [db]);

	// Photos finish in parallel; only the latest reload may update the view.
	const reloads = useRef(0);
	const reload = useCallback(async () => {
		const call = ++reloads.current;
		if (!passportId) return setData(EMPTY);
		const photos = await db.photos
			.where("passportId")
			.equals(passportId)
			.sortBy("name");
		const extractions = await db.extractions.bulkGet(
			photos.map((photo) => photo.id),
		);
		const stamps = await db.stamps
			.where("passportId")
			.equals(passportId)
			.toArray();
		if (call !== reloads.current) return;
		setData({
			passportId,
			photos,
			extractions: new Map(
				extractions.flatMap((extraction) =>
					extraction ? [[extraction.photoId, extraction]] : [],
				),
			),
			stamps,
		});
	}, [db, passportId]);

	// Reload when the passport changes and whenever a photo starts or finishes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `active` is the trigger.
	useEffect(() => {
		void reload();
	}, [reload, active]);

	// Until the selected passport's photos are loaded, the list shows another passport.
	const loaded = data.passportId === passportId;
	const passport = passports.find((p) => p.id === data.passportId);
	const notOk = data.photos.filter(
		(photo) => data.extractions.get(photo.id)?.status !== "ok",
	);
	const failed = data.photos.filter(
		(photo) => data.extractions.get(photo.id)?.status === "failed",
	);
	const busy = active.size > 0;

	const run = (photos: PhotoRecord[]) => {
		if (!passport || !loaded) return;
		void runs.start(photos, (photo) =>
			extractPhoto(db, ai, settings, passport, photo),
		);
	};

	if (!settings.openRouterKey) {
		return (
			<Stack>
				<PageHeader
					eyebrow="Step 2 of 5"
					title="Extract"
					art={<PixelArt name="stamp" scale={4} />}
				/>
				<EmptyState
					art={<PixelArt name="stamp" scale={6} />}
					title="An API key is needed"
					action={
						<Link to="/settings" className="vp-button" data-variant="primary">
							Add it in Settings
						</Link>
					}
				>
					Extraction needs your OpenRouter API key.
				</EmptyState>
			</Stack>
		);
	}

	return (
		<Stack>
			<PageHeader
				eyebrow="Step 2 of 5"
				title="Extract"
				art={<PixelArt name="stamp" scale={4} />}
				description={
					<>
						Read stamps from passport photos with{" "}
						<code className="extract-model">{settings.model}</code>.
					</>
				}
			/>
			{passports.length === 0 ? (
				<EmptyState
					art={<PixelArt name="passport" scale={6} />}
					title="No passports yet"
					action={
						<Link to="/import" className="vp-button" data-variant="primary">
							Import photos
						</Link>
					}
				>
					Add a passport and photos of its stamp pages first.
				</EmptyState>
			) : (
				<Card>
					<div className="extract-controls">
						<label className="vp-field">
							<span className="vp-field-label">Passport</span>
							<select
								className="vp-input"
								value={passportId}
								disabled={busy}
								onChange={(event) => setPassportId(event.target.value)}
							>
								{passports.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
						</label>
						<Toolbar>
							<Button
								variant="primary"
								disabled={busy || !loaded || notOk.length === 0}
								onClick={() => run(notOk)}
							>
								Extract
							</Button>
							<Button
								disabled={busy || !loaded || failed.length === 0}
								onClick={() => run(failed)}
							>
								Retry failed
							</Button>
							<ToolbarSpacer />
							{loaded ? (
								<span className="extract-summary">
									<strong className="extract-summary-count">
										{data.photos.length - notOk.length}/{data.photos.length}
									</strong>{" "}
									photos read
								</span>
							) : null}
						</Toolbar>
					</div>
					{progress ? (
						<div className="extract-progress">
							<Progress
								value={progress.done}
								max={progress.total}
								label="Extraction progress"
							/>
							<span>
								{progress.done} of {progress.total} photos done
							</span>
						</div>
					) : null}
				</Card>
			)}
			{data.photos.length > 0 ? (
				<Card title="Photos">
					<ul aria-label="Photos" className="extract-list">
						{data.photos.map((photo) => (
							<PhotoRow
								key={photo.id}
								photo={photo}
								extraction={data.extractions.get(photo.id)}
								stamps={data.stamps.filter((s) => s.photoId === photo.id)}
								running={active.has(photo.id)}
								canReextract={!busy && loaded}
								onReextract={() => setReextract(photo)}
							/>
						))}
					</ul>
				</Card>
			) : null}
			<Conflicts stamps={data.stamps} />
			<Dialog
				open={reextract !== null}
				onOpenChange={(open) => {
					if (!open) setReextract(null);
				}}
				title={`Re-extract ${reextract?.name ?? ""}?`}
				actions={
					<>
						<Button onClick={() => setReextract(null)}>Cancel</Button>
						<Button
							variant="primary"
							onClick={() => {
								if (reextract) run([reextract]);
								setReextract(null);
							}}
						>
							Re-extract
						</Button>
					</>
				}
			>
				<p>
					The photo is sent to {settings.model} again. Its unreviewed AI stamps
					are replaced; reviewed and hand-added stamps stay, so a reviewed stamp
					may appear twice.
				</p>
			</Dialog>
		</Stack>
	);
}

function PhotoRow({
	photo,
	extraction,
	stamps,
	running,
	canReextract,
	onReextract,
}: {
	photo: PhotoRecord;
	extraction: PhotoExtraction | undefined;
	stamps: Stamp[];
	running: boolean;
	canReextract: boolean;
	onReextract: () => void;
}) {
	const flagged = stamps.filter((stamp) => stamp.problem);
	return (
		<li
			aria-label={photo.name}
			className="extract-row"
			data-state={running ? "running" : (extraction?.status ?? "new")}
		>
			<div className="extract-row-main">
				<span className="extract-row-name">{photo.name}</span>{" "}
				{running ? (
					<Badge tone="info" dot>
						reading…
					</Badge>
				) : !extraction ? (
					<Badge>not extracted</Badge>
				) : extraction.status === "ok" ? (
					<Badge tone="good">
						ok · {stamps.length} {stamps.length === 1 ? "stamp" : "stamps"}
					</Badge>
				) : (
					<>
						<Badge tone="bad">failed</Badge>{" "}
						<span className="extract-row-error">
							{extraction.notes.split("\n")[0]}
						</span>
					</>
				)}
				{extraction?.status === "ok" && !running ? (
					<Button size="sm" disabled={!canReextract} onClick={onReextract}>
						Re-extract
					</Button>
				) : null}
			</div>
			{flagged.length > 0 ? (
				<ul className="extract-flags">
					{flagged.map((stamp) => (
						<li key={stamp.id}>
							<Badge tone="warn">check</Badge> {stamp.problem}
						</li>
					))}
				</ul>
			) : null}
		</li>
	);
}

function Conflicts({ stamps }: { stamps: Stamp[] }) {
	const conflicts = findConflicts(pairVisits(stamps), stamps);
	if (conflicts.length === 0) return null;
	const byId = new Map(stamps.map((stamp) => [stamp.id, stamp]));
	const span = (visit: Conflict["first"]) =>
		`${visit.zone} ${byId.get(visit.entryStampId ?? "")?.date} – ${byId.get(visit.exitStampId ?? "")?.date}`;
	return (
		<Card
			title="Timeline conflicts"
			description="Two places at once: one of these stamps is probably misread."
		>
			<ul aria-label="Timeline conflicts" className="extract-conflicts">
				{conflicts.map(({ first, second }) => (
					<li key={`${first.entryStampId}-${second.entryStampId}`}>
						{`${span(first)} overlaps ${span(second)}`}
					</li>
				))}
			</ul>
		</Card>
	);
}
