import { spanLength, staySpan, type TravelStay } from "@voyput/core";
import { countryName, flagOf, plural, stayRange } from "./format";

/** How a stay stands: approved or ready to approve, needs a look, or has an error. */
export type StayStatus = "ok" | "check" | "error";

export const STATUS_NAMES: Readonly<Record<StayStatus, string>> = {
	ok: "ready",
	check: "needs a look",
	error: "has an error",
};

/** One stay in the list: what, where, when, how long, and its status. Editing is in the panel. */
export function StayRow({
	stay,
	number,
	status,
	birth,
	today,
	selected,
	onSelect,
}: {
	stay: TravelStay;
	/** Position in the history, from 1. */
	number: number;
	status: StayStatus;
	birth: string | null;
	today: string;
	selected: boolean;
	onSelect: () => void;
}) {
	const days = spanLength(staySpan(stay, birth, today));
	const name = countryName(stay.countryCode);
	const range = stayRange(stay.arrival.date ?? birth, stay.departure.date);
	const place = stay.place.split(",")[0]?.trim() ?? "";
	const statusName = stay.approved ? "approved" : STATUS_NAMES[status];
	return (
		<button
			type="button"
			className="vp-stay"
			data-selected={selected || undefined}
			data-approved={stay.approved || undefined}
			data-kind={stay.kind}
			aria-pressed={selected}
			aria-label={`${number}. ${name}, ${range}, ${statusName}`}
			onClick={onSelect}
		>
			<span className="vp-stay-flag" aria-hidden="true">
				{flagOf(stay.countryCode)}
			</span>
			<span className="vp-stay-text">
				<span className="vp-stay-country">
					<strong>{name}</strong>
					{stay.kind === "transit" ? (
						<span className="vp-stay-place"> · transit</span>
					) : null}
					{place ? <span className="vp-stay-place"> · {place}</span> : null}
				</span>
				<span className="vp-stay-dates">{range}</span>
			</span>
			<span
				className="vp-stay-days"
				title="Calendar days, arrival and departure included"
			>
				{days === null ? "— days" : plural(days, "day")}
			</span>
			<span
				className="vp-stay-status"
				data-status={status}
				data-approved={stay.approved || undefined}
				title={statusName}
				aria-hidden="true"
			/>
		</button>
	);
}
