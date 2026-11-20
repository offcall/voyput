import {
	type BorderCrossing,
	type CheckedStamp,
	type DayRun,
	type Direction,
	isCountryCode,
	isPlausibleDay,
	isValidDate,
	type NearbyPhoto,
	type NoteKind,
	severity,
	type ValidateResult,
} from "@voyput/core";
import { Badge, Button } from "@voyput/ui";
import { useEffect, useRef, useState } from "react";
import { localToday } from "../../data/today";
import { CountryTag } from "./CountryTag";
import {
	CROSSINGS,
	crossingIcon,
	DIRECTIONS,
	directionIcon,
	formatDatesIn,
	formatDay,
} from "./format";
import { PannableDayStrip } from "./PannableDayStrip";
import { problemParts, type StampEdit } from "./reviewStore";
import type { TravelDays } from "./strip";

export type Validation =
	| { status: "running" }
	| { status: "error"; message: string }
	| { status: "done"; result: ValidateResult };

/** Datalist id of known country names, rendered once by the page. */
export const COUNTRY_LIST_ID = "review-countries";

/** A text input that saves on blur, so typing does not write on every key. */
function DraftInput({
	label,
	value,
	onCommit,
	maxLength,
	list,
}: {
	label: string;
	value: string;
	/** Returns false to reject the value and show the stored one again. */
	onCommit: (value: string) => boolean | undefined;
	maxLength?: number;
	list?: string;
}) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	return (
		<label className="vp-field">
			<span className="vp-field-label">{label}</span>
			<input
				className="vp-input"
				value={draft}
				maxLength={maxLength}
				list={list}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => {
					if (draft.trim() !== value && onCommit(draft.trim()) === false)
						setDraft(value);
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
				}}
			/>
		</label>
	);
}

/**
 * The stamp's date. Only a whole, plausible date saves, so a year typed digit
 * by digit never becomes 0002: typed keys save on Enter or when the field is
 * left, a day picked in the date picker saves at once. A rejected value shows
 * the stored date again.
 */
function DateInput({
	value,
	title,
	onCommit,
}: {
	value: string | null;
	title: string | undefined;
	onCommit: (date: string) => void;
}) {
	const [typed, setTyped] = useState(value ?? "");
	useEffect(() => setTyped(value ?? ""), [value]);
	// Keys were pressed since the field was last left: the value is being typed.
	const typing = useRef(false);
	const save = (date: string): boolean => {
		if (date === value || !isPlausibleDay(date, localToday())) return false;
		onCommit(date);
		return true;
	};
	const commit = () => {
		typing.current = false;
		if (!save(typed)) setTyped(value ?? "");
	};
	return (
		<label className="vp-field">
			<span className="vp-field-label">Date</span>
			<input
				className="vp-input"
				type="date"
				value={typed}
				title={title}
				onChange={(event) => {
					setTyped(event.target.value);
					// Typing reports a whole date after each digit: only a picked day saves now.
					if (!typing.current) save(event.target.value);
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") commit();
					else typing.current = true;
				}}
				onBlur={commit}
			/>
		</label>
	);
}

/** Photos of one day in one country, as one chip. */
const groupNearby = (nearby: readonly NearbyPhoto[]) => {
	const groups = new Map<string, { photo: NearbyPhoto; count: number }>();
	for (const photo of nearby) {
		const key = `${photo.date}-${photo.countryCode}`;
		const group = groups.get(key);
		if (group) group.count++;
		else groups.set(key, { photo, count: 1 });
	}
	return [...groups.values()];
};

/**
 * The date a photo-location suggestion points to ("Possible correct date is around
 * 2016-08-11 …", "… also a photo in Spain on 2016-08-11 …"), for a one-click fix.
 */
export function suggestedDate(lines: readonly string[]): string | null {
	for (const line of lines) {
		const match =
			/correct date is around (\d{4}-\d{2}-\d{2})/.exec(line) ??
			/also a photo in .+? on (\d{4}-\d{2}-\d{2})/.exec(line);
		if (match?.[1] && isValidDate(match[1])) return match[1];
	}
	return null;
}

const NOTE_LABELS: Record<NoteKind, string> = {
	problem: "Check",
	icloudCheck: "Photo location history",
	suggestion: "Suggestion",
};

export function StampCard({
	item,
	number,
	dayRuns,
	travelDays,
	windowDays,
	nearby,
	expanded,
	focusSeq,
	countryCodes,
	countryNames,
	validation,
	onToggle,
	onEdit,
	onDelete,
	onDismiss,
	onValidate,
	onNext,
}: {
	item: CheckedStamp;
	number: number;
	dayRuns: readonly DayRun[];
	travelDays: TravelDays;
	/** Days shown before and after the stamp date. */
	windowDays: number;
	nearby: readonly NearbyPhoto[];
	expanded: boolean;
	/** Opened from the timeline: scrolled to and outlined. */
	/** Set while opened from the queue or the timeline; each new value scrolls to it again. */
	focusSeq: number | null;
	/** Country name → code, to keep name and code in step. */
	countryCodes: ReadonlyMap<string, string>;
	/** Code → country name. */
	countryNames: ReadonlyMap<string, string>;
	validation: Validation | undefined;
	onToggle: () => void;
	onEdit: (edit: StampEdit) => void;
	onDelete: () => void;
	onDismiss: (kind: NoteKind, dismissed: boolean) => void;
	/** Missing when no AI key is set. */
	onValidate: (() => void) | undefined;
	/** The queue's Next from this stamp; shown beside the main action on phones only. Missing when nothing is left. */
	onNext?: (() => void) | undefined;
}) {
	const { stamp, check } = item;
	const level = severity(item);
	const notes: { kind: NoteKind; lines: string[] }[] = [
		{ kind: "problem" as const, lines: problemParts(stamp.problem) },
		{ kind: "icloudCheck" as const, lines: [check.icloudCheck] },
		{ kind: "suggestion" as const, lines: [check.suggestion] },
	].filter((note) => note.lines.some(Boolean));
	// The first open warning sits under the row, folded or not, with its fix.
	const lead = notes.find(
		({ kind }) => kind !== "suggestion" && !stamp.dismissed?.[kind],
	);
	const suggestion = notes.find(
		({ kind }) => kind === "suggestion" && !stamp.dismissed?.suggestion,
	);
	const fix =
		lead?.kind === "icloudCheck" && suggestion
			? suggestedDate(suggestion.lines)
			: null;
	const label = `Stamp ${number}`;
	const ref = useRef<HTMLElement>(null);
	useEffect(() => {
		if (focusSeq !== null) ref.current?.scrollIntoView?.({ block: "center" });
	}, [focusSeq]);

	return (
		<article
			ref={ref}
			className="review-stamp"
			data-severity={level}
			data-reviewed={stamp.reviewed || undefined}
			data-focused={focusSeq !== null || undefined}
			aria-label={label}
		>
			<div className="review-stamp-summary">
				<button
					type="button"
					className="review-stamp-toggle"
					aria-expanded={expanded}
					onClick={onToggle}
				>
					<CountryTag code={stamp.countryCode} />
					<span className="review-row-dir" data-direction={stamp.direction}>
						{directionIcon(stamp.direction)} {stamp.direction}
					</span>
					<span className="review-stamp-date">
						{stamp.date ? formatDay(stamp.date) : "no date"}
					</span>
					<span className="review-stamp-place">
						{stamp.country ?? "unknown country"}
						{stamp.location ? (
							<span className="review-muted"> · {stamp.location}</span>
						) : null}
					</span>
					<span className="review-stamp-crossing" aria-hidden="true">
						{crossingIcon(stamp.borderCrossing)}
					</span>
					<span className="review-chevron" aria-hidden="true">
						▾
					</span>
				</button>
				<span className="review-stamp-actions">
					{level === "critical" ? <Badge tone="bad">issue</Badge> : null}
					{level === "warning" ? (
						<Badge tone="warn">photo location</Badge>
					) : null}
					{stamp.reviewed ? (
						<span
							className="review-done-mark"
							role="img"
							aria-label="Reviewed"
							title="Reviewed"
						>
							✓
						</span>
					) : null}
				</span>
			</div>
			{lead || item.overlap ? (
				<div className="review-notes">
					{item.overlap ? <OverlapNote text={item.overlap} /> : null}
					{lead ? (
						<Note
							kind={lead.kind}
							lines={lead.lines}
							fix={fix && fix !== stamp.date ? fix : null}
							onFix={(date) => onEdit({ date })}
							onDismiss={() => onDismiss(lead.kind, true)}
						/>
					) : null}
				</div>
			) : null}
			{expanded ? (
				<div className="review-stamp-body">
					<div className="review-fields">
						<label className="vp-field">
							<span className="vp-field-label">Direction</span>
							<select
								className="vp-input"
								value={stamp.direction}
								onChange={(event) =>
									onEdit({ direction: event.target.value as Direction })
								}
							>
								{DIRECTIONS.map((d) => (
									<option key={d.value} value={d.value}>
										{d.label}
									</option>
								))}
							</select>
						</label>
						<label className="vp-field">
							<span className="vp-field-label">Border crossing</span>
							<select
								className="vp-input"
								value={stamp.borderCrossing}
								onChange={(event) =>
									onEdit({
										borderCrossing: event.target.value as BorderCrossing,
									})
								}
							>
								{CROSSINGS.map((c) => (
									<option key={c.value} value={c.value}>
										{c.icon} {c.label}
									</option>
								))}
							</select>
						</label>
						<DateInput
							value={stamp.date}
							title={stamp.dateText ? `Printed: ${stamp.dateText}` : undefined}
							onCommit={(date) => onEdit({ date })}
						/>
						<DraftInput
							label="Country"
							value={stamp.country ?? ""}
							list={COUNTRY_LIST_ID}
							onCommit={(value) => {
								// An unknown name clears the code rather than keep one that may not match.
								onEdit({
									country: value || null,
									countryCode: countryCodes.get(value) ?? null,
								});
								return true;
							}}
						/>
						<DraftInput
							label="Code"
							value={stamp.countryCode ?? ""}
							maxLength={2}
							onCommit={(value) => {
								const code = value.toUpperCase();
								if (!code) {
									onEdit({ countryCode: null });
									return true;
								}
								if (!isCountryCode(code)) return false;
								const name = countryNames.get(code);
								onEdit({
									countryCode: code,
									...(name ? { country: name } : {}),
								});
								return true;
							}}
						/>
						<DraftInput
							label="Location"
							value={stamp.location ?? ""}
							onCommit={(value) => {
								onEdit({ location: value || null });
								return true;
							}}
						/>
					</div>
					{stamp.dateText ? (
						<p className="review-muted review-printed">
							Printed: <code>{stamp.dateText}</code>
							{stamp.confidence !== null
								? ` · confidence ${stamp.confidence}`
								: ""}
						</p>
					) : null}
					{stamp.notes ? <p className="review-muted">{stamp.notes}</p> : null}
					{notes
						.filter((note) => note !== lead)
						.map(({ kind, lines }) =>
							stamp.dismissed?.[kind] ? (
								<p key={kind} className="review-note-hidden">
									{NOTE_LABELS[kind]} marked as fine.
									<button
										type="button"
										className="review-link"
										onClick={() => onDismiss(kind, false)}
									>
										Show again
									</button>
								</p>
							) : (
								<Note
									key={kind}
									kind={kind}
									lines={lines}
									fix={null}
									onFix={() => undefined}
									onDismiss={() => onDismiss(kind, true)}
								/>
							),
						)}
					{stamp.date ? (
						<div className="review-evidence">
							<h4 className="review-section-label">
								Photo location history ±{windowDays} days
							</h4>
							<PannableDayStrip
								dayRuns={dayRuns}
								travelDays={travelDays}
								date={stamp.date}
								direction={stamp.direction}
								readDate={
									stamp.readDate === undefined ? stamp.date : stamp.readDate
								}
								stampCode={stamp.countryCode}
								radius={windowDays}
								onDate={(date) => onEdit({ date })}
							/>
							{nearby.length > 0 ? (
								<ul className="review-nearby" aria-label="Nearest photos">
									{groupNearby(nearby).map(({ photo, count }) => (
										<li
											key={`${photo.date}-${photo.countryCode}`}
											data-match={
												photo.countryCode === stamp.countryCode || undefined
											}
											title={photo.filename}
										>
											<CountryTag code={photo.countryCode} />
											<span>{formatDay(photo.date)}</span>
											<span className="review-muted">
												{photo.gap === 0 ? "same day" : `${photo.gap} d`}
												{count > 1 ? ` · ${count} photos` : ""}
											</span>
										</li>
									))}
								</ul>
							) : null}
						</div>
					) : null}
					<div className="review-stamp-footer">
						<div className="review-stamp-tools">
							<button
								type="button"
								className="review-delete"
								aria-label={`Delete ${label.toLowerCase()}`}
								onClick={onDelete}
							>
								<TrashIcon /> Delete
							</button>
							<ValidateRow
								validation={validation}
								onValidate={onValidate}
								onApply={(correction) =>
									onEdit({
										...correction,
										...(correction.country && !correction.countryCode
											? {
													countryCode:
														countryCodes.get(correction.country) ?? null,
												}
											: {}),
									})
								}
							/>
						</div>
						{/* On phones this row sticks to the bottom of the screen while the stamp is open. */}
						<div className="review-stamp-main">
							<ReviewedControl
								reviewed={stamp.reviewed}
								onChange={(reviewed) => onEdit({ reviewed })}
							/>
							{onNext ? (
								<Button className="review-stamp-next" onClick={onNext}>
									Next →
								</Button>
							) : null}
						</div>
					</div>
				</div>
			) : null}
		</article>
	);
}

/**
 * Another stay at the same time: red like a problem, with no "Looks right",
 * since it goes away only when a date or direction is fixed.
 */
function OverlapNote({ text }: { text: string }) {
	return (
		<div className="review-note" data-kind="problem">
			<span className="review-note-body">
				<span className="review-note-tag">Overlap</span>
				<span className="review-note-line">{text}</span>
			</span>
		</div>
	);
}

/** One warning with "Looks right" and, where the photo locations point to a date, a fix. */
function Note({
	kind,
	lines,
	fix,
	onFix,
	onDismiss,
}: {
	kind: NoteKind;
	lines: readonly string[];
	fix: string | null;
	onFix: (date: string) => void;
	onDismiss: () => void;
}) {
	return (
		<div className="review-note" data-kind={kind}>
			<span className="review-note-body">
				<span className="review-note-tag">{NOTE_LABELS[kind]}</span>
				{lines.map((line) => (
					<span key={line} className="review-note-line">
						{formatDatesIn(line)}
					</span>
				))}
			</span>
			<span className="review-note-actions">
				{fix ? (
					<button
						type="button"
						className="review-note-fix"
						onClick={() => onFix(fix)}
					>
						Move to {formatDay(fix)}
					</button>
				) : null}
				<button
					type="button"
					className="review-note-hide"
					aria-label={`${NOTE_LABELS[kind]} looks right`}
					onClick={onDismiss}
				>
					Looks right
				</button>
			</span>
		</div>
	);
}

/**
 * The end of an opened stamp and its one main action: "Mark reviewed", or once
 * reviewed a quiet "Reviewed" with a way to undo it.
 */
function ReviewedControl({
	reviewed,
	onChange,
}: {
	reviewed: boolean;
	onChange: (reviewed: boolean) => void;
}) {
	if (!reviewed)
		return (
			<Button
				variant="primary"
				className="review-mark"
				onClick={() => onChange(true)}
			>
				<span aria-hidden="true">✓ </span>Mark reviewed
			</Button>
		);
	return (
		<p className="review-reviewed">
			<span className="review-reviewed-label">
				Reviewed <span aria-hidden="true">✓</span>
			</span>
			<span aria-hidden="true"> · </span>
			<button
				type="button"
				className="review-link"
				aria-label="Undo reviewed"
				onClick={() => onChange(false)}
			>
				undo
			</button>
		</p>
	);
}

function TrashIcon() {
	return (
		<svg
			width="15"
			height="15"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
		</svg>
	);
}

function ValidateRow({
	validation,
	onValidate,
	onApply,
}: {
	validation: Validation | undefined;
	onValidate: (() => void) | undefined;
	onApply: (edit: StampEdit) => void;
}) {
	const running = validation?.status === "running";
	return (
		<div className="review-validate">
			<Button
				size="sm"
				disabled={!onValidate || running}
				onClick={() => onValidate?.()}
			>
				{running ? "Checking…" : "Validate with AI"}
			</Button>
			{validation?.status === "error" ? (
				<p role="alert">{validation.message}</p>
			) : null}
			{validation?.status === "done" ? (
				<div role="status">
					<Badge tone={validation.result.ok ? "good" : "warn"}>
						{validation.result.ok ? "looks right" : "needs a fix"}
					</Badge>{" "}
					{formatDatesIn(validation.result.explanation)}
					{!validation.result.ok && validation.result.correction ? (
						<p>
							Suggested:{" "}
							{Object.entries(validation.result.correction)
								.map(([field, value]) => `${field} ${value}`)
								.join(", ")}{" "}
							<Button
								onClick={() =>
									validation.result.correction &&
									onApply(validation.result.correction)
								}
							>
								Apply
							</Button>
						</p>
					) : null}
				</div>
			) : null}
		</div>
	);
}
