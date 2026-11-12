import {
	type BorderCrossing,
	type CheckedStamp,
	type Direction,
	isCountryCode,
	isValidDate,
	type NearbyPhoto,
	type NoteKind,
	severity,
	type ValidateResult,
} from "@voyput/core";
import { Badge, Button } from "@voyput/ui";
import { useEffect, useState } from "react";
import { CROSSINGS, DIRECTIONS, directionIcon, flagOf } from "./format";
import type { StampEdit } from "./reviewStore";

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

const NOTE_LABELS: Record<NoteKind, string> = {
	problem: "Date check",
	icloudCheck: "Location history",
	suggestion: "Suggestion",
};

export function StampCard({
	item,
	number,
	nearby,
	expanded,
	countryCodes,
	countryNames,
	validation,
	onToggle,
	onEdit,
	onDelete,
	onDismiss,
	onValidate,
}: {
	item: CheckedStamp;
	number: number;
	nearby: readonly NearbyPhoto[];
	expanded: boolean;
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
}) {
	const { stamp, check } = item;
	const level = severity(item);
	const notes: { kind: NoteKind; text: string }[] = [
		{ kind: "problem" as const, text: stamp.problem ?? "" },
		{ kind: "icloudCheck" as const, text: check.icloudCheck },
		{ kind: "suggestion" as const, text: check.suggestion },
	].filter((note) => note.text);
	const label = `Stamp ${number}`;

	return (
		<article className="review-stamp" data-severity={level} aria-label={label}>
			<div className="review-stamp-summary">
				<button
					type="button"
					className="review-stamp-toggle"
					aria-expanded={expanded}
					onClick={onToggle}
				>
					<span aria-hidden="true">{flagOf(stamp.countryCode)}</span>{" "}
					{directionIcon(stamp.direction)} {stamp.date ?? "no date"} ·{" "}
					{stamp.country ?? "unknown country"}
					{stamp.location ? ` · ${stamp.location}` : ""}
				</button>
				{level === "critical" ? <Badge tone="bad">issue</Badge> : null}
				{level === "warning" ? <Badge tone="warn">location</Badge> : null}
				{stamp.reviewed ? <Badge tone="good">reviewed</Badge> : null}
				<Button
					variant="danger"
					aria-label={`Delete ${label.toLowerCase()}`}
					onClick={onDelete}
				>
					🗑
				</Button>
			</div>

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
						<label className="vp-field">
							<span className="vp-field-label">Date</span>
							<input
								className="vp-input"
								type="date"
								value={stamp.date ?? ""}
								title={
									stamp.dateText ? `Printed: ${stamp.dateText}` : undefined
								}
								onChange={(event) => {
									const value = event.target.value || null;
									if (isValidDate(value)) onEdit({ date: value });
								}}
							/>
						</label>
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
					<label className="review-check">
						<input
							type="checkbox"
							checked={stamp.reviewed}
							onChange={(event) => onEdit({ reviewed: event.target.checked })}
						/>{" "}
						Reviewed
					</label>
					{stamp.dateText ? (
						<p className="review-muted">
							Printed: <code>{stamp.dateText}</code>
							{stamp.confidence !== null
								? ` · confidence ${stamp.confidence}`
								: ""}
						</p>
					) : null}
					{stamp.notes ? <p className="review-muted">{stamp.notes}</p> : null}
					{notes.map(({ kind, text }) =>
						stamp.dismissed?.[kind] ? (
							<p key={kind} className="review-muted">
								{NOTE_LABELS[kind]} hidden.{" "}
								<Button onClick={() => onDismiss(kind, false)}>
									Show again
								</Button>
							</p>
						) : (
							<div key={kind} className="review-note" data-kind={kind}>
								<strong>{NOTE_LABELS[kind]}:</strong> {text}{" "}
								<Button
									aria-label={`Hide ${NOTE_LABELS[kind].toLowerCase()}`}
									onClick={() => onDismiss(kind, true)}
								>
									Hide
								</Button>
							</div>
						),
					)}
					{nearby.length > 0 ? (
						<details>
							<summary>Nearest photos</summary>
							<ul>
								{nearby.map((photo) => (
									<li key={`${photo.date}-${photo.filename}`}>
										{photo.date} · {flagOf(photo.countryCode)} {photo.country} ·{" "}
										{photo.gap} day(s) away
									</li>
								))}
							</ul>
						</details>
					) : null}
					<ValidateRow
						validation={validation}
						onValidate={onValidate}
						onApply={(correction) =>
							onEdit({
								...correction,
								...(correction.country && !correction.countryCode
									? {
											countryCode: countryCodes.get(correction.country) ?? null,
										}
									: {}),
							})
						}
					/>
				</div>
			) : null}
		</article>
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
			<Button disabled={!onValidate || running} onClick={() => onValidate?.()}>
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
					{validation.result.explanation}
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
