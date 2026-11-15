import {
	type CountryGroup,
	type FilteredStay,
	methodLabel,
	SOURCE_LABELS,
} from "@voyput/core";
import { Button, flagEmoji } from "@voyput/ui";
import { type ReactNode, useEffect, useRef } from "react";
import { useCountryColour } from "../../../app/countryColours";

function Panel({
	label,
	title,
	countryCode,
	onClose,
	children,
	actions,
}: {
	label: string;
	title: string;
	countryCode: string;
	onClose: () => void;
	children: ReactNode;
	actions?: ReactNode;
}) {
	const colourOf = useCountryColour();
	const ref = useRef<HTMLElement>(null);
	// Move focus to the panel when it opens or shows another item, so keyboard users land in it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: refocus when the item changes.
	useEffect(() => {
		ref.current?.focus();
	}, [title, label]);
	return (
		<aside
			ref={ref}
			className="vp-explore-detail"
			aria-label={label}
			tabIndex={-1}
			style={{ borderTopColor: colourOf(countryCode) }}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<header>
				<span className="vp-explore-detail-flag" aria-hidden="true">
					{flagEmoji(countryCode)}
				</span>
				<h2>{title}</h2>
				<Button size="sm" variant="ghost" onClick={onClose}>
					Close
				</Button>
			</header>
			{children}
			{actions ? (
				<div className="vp-explore-detail-actions">{actions}</div>
			) : null}
		</aside>
	);
}

function Facts({ items }: { items: [string, ReactNode][] }) {
	return (
		<dl className="vp-explore-facts">
			{items.map(([term, value]) => (
				<div key={term}>
					<dt>{term}</dt>
					<dd>{value}</dd>
				</div>
			))}
		</dl>
	);
}

const edgeText = (edge: FilteredStay["entry"]) =>
	`${edge.date} · ${methodLabel(edge.method)} · ${SOURCE_LABELS[edge.source]}`;

/** One stay: dates, how its edges are known, places and stamps. */
export function StayDetail({
	stay,
	filtered,
	onCountry,
	onFilter,
	onClose,
}: {
	stay: FilteredStay;
	/** The stay filter is exactly this stay. */
	filtered: boolean;
	onCountry: (countryCode: string) => void;
	onFilter: () => void;
	onClose: () => void;
}) {
	const kind = stay.kind === "transit" ? "Transit" : "Stay";
	return (
		<Panel
			label="Stay details"
			title={stay.country}
			countryCode={stay.countryCode}
			onClose={onClose}
			actions={
				<>
					<Button size="sm" onClick={() => onCountry(stay.countryCode)}>
						All visits to {stay.country}
					</Button>
					{filtered ? null : (
						<Button size="sm" onClick={onFilter}>
							Show only this stay
						</Button>
					)}
				</>
			}
		>
			<Facts
				items={[
					["Dates", `${stay.start} → ${stay.end}`],
					[
						"Days",
						stay.clippedDays === stay.days
							? `${stay.days} · ${kind}`
							: `${stay.clippedDays} of ${stay.days} in range · ${kind}`,
					],
					["Entry", edgeText(stay.entry)],
					["Exit", edgeText(stay.exit)],
					["Places", stay.place || "—"],
					["Evidence", `${stay.stamps} stamps · ${stay.stopDays} days seen`],
				]}
			/>
			{stay.estimated ? (
				<p className="vp-viz-muted">At least one edge date is estimated.</p>
			) : null}
		</Panel>
	);
}

/** One country: totals in the selection and its visits, each opening the stay. */
export function CountryDetail({
	group,
	visits,
	filtered,
	onStay,
	onFilter,
	onClose,
}: {
	group: CountryGroup;
	visits: readonly FilteredStay[];
	/** The country filter is exactly this country. */
	filtered: boolean;
	onStay: (stay: FilteredStay) => void;
	onFilter: () => void;
	onClose: () => void;
}) {
	return (
		<Panel
			label="Country details"
			title={group.country}
			countryCode={group.countryCode}
			onClose={onClose}
			actions={
				filtered ? null : (
					<Button size="sm" onClick={onFilter}>
						Show only {group.country}
					</Button>
				)
			}
		>
			<Facts
				items={[
					["Days", group.days],
					["Visits", group.visits],
					["Longest", `${group.longest} days`],
					["Stamps", group.stamps],
					["Region", group.region],
				]}
			/>
			<ul className="vp-explore-visits" aria-label="Visits">
				{visits.map((v) => (
					<li key={v.id}>
						<button
							type="button"
							className="vp-explore-visit"
							onClick={() => onStay(v)}
						>
							<span>
								{v.start} → {v.end}
							</span>
							<b>{v.clippedDays} d</b>
							{v.estimated ? <small>≈</small> : null}
						</button>
					</li>
				))}
			</ul>
		</Panel>
	);
}
