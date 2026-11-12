import { Link } from "@tanstack/react-router";
import {
	type Conflict,
	findConflicts,
	mapConcurrent,
	type Passport,
	type PhotoExtraction,
	pairVisits,
	type Stamp,
} from "@voyput/core";
import { Badge, Button, Card, Progress, Stack } from "@voyput/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAi } from "../../ai/AiContext";
import { useDb } from "../../db/DbContext";
import type { PhotoRecord } from "../../db/db";
import { useSettings } from "../../settings/SettingsContext";
import { extractPhoto } from "./extractPhoto";

const CONCURRENCY = 3;

interface PassportData {
	photos: PhotoRecord[];
	extractions: Map<string, PhotoExtraction>;
	stamps: Stamp[];
}

const EMPTY: PassportData = { photos: [], extractions: new Map(), stamps: [] };

export function ExtractPage() {
	const db = useDb();
	const ai = useAi();
	const { settings } = useSettings();
	const [passports, setPassports] = useState<Passport[]>([]);
	const [passportId, setPassportId] = useState("");
	const [data, setData] = useState<PassportData>(EMPTY);
	const [running, setRunning] = useState<Set<string>>(new Set());
	const [progress, setProgress] = useState<{ done: number; total: number }>();

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
			photos,
			extractions: new Map(
				extractions.flatMap((extraction) =>
					extraction ? [[extraction.photoId, extraction]] : [],
				),
			),
			stamps,
		});
	}, [db, passportId]);

	useEffect(() => {
		void reload();
	}, [reload]);

	const passport = passports.find((p) => p.id === passportId);
	const notOk = data.photos.filter(
		(photo) => data.extractions.get(photo.id)?.status !== "ok",
	);
	const failed = data.photos.filter(
		(photo) => data.extractions.get(photo.id)?.status === "failed",
	);
	const busy = running.size > 0;

	const run = async (photos: PhotoRecord[]) => {
		if (!passport || photos.length === 0) return;
		setProgress({ done: 0, total: photos.length });
		await mapConcurrent(photos, CONCURRENCY, async (photo) => {
			setRunning((current) => new Set(current).add(photo.id));
			await extractPhoto(db, ai, settings, passport, photo);
			setRunning((current) => {
				const next = new Set(current);
				next.delete(photo.id);
				return next;
			});
			setProgress(
				(current) => current && { ...current, done: current.done + 1 },
			);
			await reload();
		});
	};

	if (!settings.openRouterKey) {
		return (
			<Stack>
				<h1>Extract</h1>
				<p>
					Extraction needs your OpenRouter API key.{" "}
					<Link to="/settings">Add it in Settings</Link>.
				</p>
			</Stack>
		);
	}

	return (
		<Stack>
			<h1>Extract</h1>
			<p>Read stamps from passport photos with {settings.model}.</p>
			{passports.length === 0 ? (
				<p>
					No passports yet. <Link to="/import">Import photos</Link> first.
				</p>
			) : (
				<Card>
					<Stack>
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
						<div>
							<Button
								variant="primary"
								disabled={busy || notOk.length === 0}
								onClick={() => void run(notOk)}
							>
								Extract
							</Button>{" "}
							<Button
								disabled={busy || failed.length === 0}
								onClick={() => void run(failed)}
							>
								Retry failed
							</Button>
						</div>
						{progress ? (
							<div>
								<Progress
									value={progress.done}
									max={progress.total}
									label="Extraction progress"
								/>
								{progress.done} of {progress.total} photos done
							</div>
						) : null}
					</Stack>
				</Card>
			)}
			{data.photos.length > 0 ? (
				<Card title="Photos">
					<ul aria-label="Photos">
						{data.photos.map((photo) => (
							<PhotoRow
								key={photo.id}
								photo={photo}
								extraction={data.extractions.get(photo.id)}
								stamps={data.stamps.filter((s) => s.photoId === photo.id)}
								running={running.has(photo.id)}
							/>
						))}
					</ul>
				</Card>
			) : null}
			<Conflicts stamps={data.stamps} />
		</Stack>
	);
}

function PhotoRow({
	photo,
	extraction,
	stamps,
	running,
}: {
	photo: PhotoRecord;
	extraction: PhotoExtraction | undefined;
	stamps: Stamp[];
	running: boolean;
}) {
	const flagged = stamps.filter((stamp) => stamp.problem);
	return (
		<li aria-label={photo.name}>
			{photo.name}{" "}
			{running ? (
				<Badge>reading…</Badge>
			) : !extraction ? (
				<Badge>not extracted</Badge>
			) : extraction.status === "ok" ? (
				<Badge tone="good">
					ok · {stamps.length} {stamps.length === 1 ? "stamp" : "stamps"}
				</Badge>
			) : (
				<>
					<Badge tone="bad">failed</Badge> {extraction.notes.split("\n")[0]}
				</>
			)}
			{flagged.length > 0 ? (
				<ul>
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
		<Card title="Timeline conflicts">
			<p>Two places at once: one of these stamps is probably misread.</p>
			<ul aria-label="Timeline conflicts">
				{conflicts.map(({ first, second }) => (
					<li key={`${first.entryStampId}-${second.entryStampId}`}>
						{`${span(first)} overlaps ${span(second)}`}
					</li>
				))}
			</ul>
		</Card>
	);
}
