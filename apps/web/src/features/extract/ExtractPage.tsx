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
	PixelArt,
	Progress,
	Stack,
} from "@voyput/ui";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useAi } from "../../ai/AiContext";
import { aiModelLabel, aiSetupNeeded } from "../../ai/client";
import { useDb } from "../../db/DbContext";
import type { PhotoRecord } from "../../db/db";
import { useSettings } from "../../settings/SettingsContext";
import { Thumb } from "../review/Thumb";
import { extractPhoto } from "./extractPhoto";
import { describeFailure } from "./failure";
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
	const readCount = data.photos.length - notOk.length;
	const pendingCount = notOk.length - failed.length;
	const openChecks = data.stamps.filter(isOpenCheck);

	const run = (photos: PhotoRecord[]) => {
		if (!passport || !loaded) return;
		void runs.start(photos, (photo, current) =>
			extractPhoto(db, ai, settings, passport, photo, current),
		);
	};

	const setup = aiSetupNeeded(settings);
	if (setup) {
		return (
			<Stack>
				<EmptyState
					art={<PixelArt name="stamp" scale={6} />}
					title={setup.title}
					action={
						<Link to="/settings" className="vp-button" data-variant="primary">
							{setup.action}
						</Link>
					}
				>
					{setup.text}
				</EmptyState>
			</Stack>
		);
	}

	return (
		<Stack>
			{passports.length === 0 ? (
				<EmptyState
					art={<PixelArt name="passport" scale={6} />}
					title="No passports yet"
					action={
						<Link
							to="/collect/$step"
							params={{ step: "passports" }}
							className="vp-button"
							data-variant="primary"
						>
							Import photos
						</Link>
					}
				>
					Add a passport and photos of its stamp pages first.
				</EmptyState>
			) : (
				<Card className="extract-bar">
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
						<p className="extract-model-line">
							Reads stamps with{" "}
							<code className="extract-model">{aiModelLabel(settings)}</code>
						</p>
						<div className="extract-actions">
							<Button
								variant="primary"
								disabled={busy || !loaded || notOk.length === 0}
								onClick={() => run(notOk)}
							>
								Extract
							</Button>
							<Button
								variant="secondary"
								disabled={busy || !loaded || failed.length === 0}
								onClick={() => run(failed)}
							>
								Retry failed
							</Button>
						</div>
					</div>
					{loaded && data.photos.length > 0 ? (
						<p className="extract-summary">
							{readCount}/{data.photos.length} photos read ·{" "}
							<Count n={openChecks.length} tone="warn" /> to check ·{" "}
							<Count n={failed.length} tone="bad" /> failed ·{" "}
							<Count n={pendingCount} tone="info" /> not read
						</p>
					) : null}
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
				<ul aria-label="Photos" className="extract-list">
					{data.photos.map((photo) => (
						<PhotoRow
							key={photo.id}
							photo={photo}
							extraction={data.extractions.get(photo.id)}
							stamps={data.stamps.filter((s) => s.photoId === photo.id)}
							running={active.has(photo.id)}
							canRun={!busy && loaded}
							onRetry={() => run([photo])}
							onReextract={() => setReextract(photo)}
						/>
					))}
				</ul>
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
					The photo is sent to {aiModelLabel(settings)} again. Its unreviewed AI
					stamps are replaced; reviewed and hand-added stamps stay, so a
					reviewed stamp may appear twice.
				</p>
			</Dialog>
		</Stack>
	);
}

/** A warning the user has not fixed (a date edit clears it) or marked as fine. */
const isOpenCheck = (stamp: Stamp) =>
	Boolean(stamp.problem) && !stamp.dismissed?.problem;

function Count({ n, tone }: { n: number; tone: "warn" | "bad" | "info" }) {
	return (
		<span className="extract-count" data-tone={n > 0 ? tone : undefined}>
			{n}
		</span>
	);
}

function PhotoRow({
	photo,
	extraction,
	stamps,
	running,
	canRun,
	onRetry,
	onReextract,
}: {
	photo: PhotoRecord;
	extraction: PhotoExtraction | undefined;
	stamps: Stamp[];
	running: boolean;
	canRun: boolean;
	onRetry: () => void;
	onReextract: () => void;
}) {
	const checks = stamps.filter(isOpenCheck);
	const state = running
		? "running"
		: !extraction
			? "new"
			: extraction.status === "failed"
				? "failed"
				: checks.length > 0
					? "check"
					: "ok";
	const failure =
		extraction?.status === "failed" && !running
			? describeFailure(extraction.notes)
			: null;
	return (
		<li aria-label={photo.name} className="extract-row" data-state={state}>
			<Thumb photo={photo} className="extract-thumb" />
			<div className="extract-row-body">
				<div className="extract-row-head">
					<span className="extract-row-name">{photo.name}</span>
					{running ? (
						<Badge tone="info" dot>
							reading…
						</Badge>
					) : !extraction ? (
						<Badge tone="info">not extracted</Badge>
					) : extraction.status === "ok" ? (
						<Badge tone={checks.length > 0 ? "warn" : "good"}>
							ok · {stamps.length} {stamps.length === 1 ? "stamp" : "stamps"}
						</Badge>
					) : (
						<Badge tone="bad">failed</Badge>
					)}
					<span className="extract-row-actions">
						{failure ? (
							<>
								<Button size="sm" disabled={!canRun} onClick={onRetry}>
									Retry
								</Button>
								<Link
									to="/collect/$step"
									params={{ step: "review" }}
									search={{ photo: photo.id }}
									className="vp-button"
									data-size="sm"
									data-variant="secondary"
								>
									Open in Review
								</Link>
							</>
						) : null}
						{extraction?.status === "ok" && !running ? (
							<Button size="sm" disabled={!canRun} onClick={onReextract}>
								Re-extract
							</Button>
						) : null}
					</span>
				</div>
				{failure ? (
					<div className="extract-failure">
						<p>{failure.summary}</p>
						<code className="extract-failure-detail">{failure.detail}</code>
					</div>
				) : null}
				{checks.length > 0 ? (
					<ul className="extract-flags" aria-label={`Checks on ${photo.name}`}>
						{checks.map((stamp) => (
							<li key={stamp.id}>
								<Badge tone="warn">check</Badge>
								<span className="extract-flag-text">{stamp.problem}</span>
								<Link
									to="/collect/$step"
									params={{ step: "review" }}
									search={{ photo: photo.id, stamp: stamp.id }}
									className="extract-flag-link"
								>
									Check in Review
								</Link>
							</li>
						))}
					</ul>
				) : null}
			</div>
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
			art={<PixelArt name="stamp" scale={3} />}
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
