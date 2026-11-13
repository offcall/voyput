import { Link } from "@tanstack/react-router";
import { EmptyState, Notice, PixelArt, type SpriteName } from "@voyput/ui";

/**
 * Data a Visualize tab cannot draw without:
 * - `locations`: photo locations from the imported location history;
 * - `trips`: trips to replay, stored or suggested (Route, Explore and other stay views).
 */
export type VizNeed = "locations" | "trips";

/** What the user has, counted once by the Visualize layout. */
export interface VizHave {
	/** Imported photo locations. */
	locations: number;
	/** Trips the stay views draw from: stored trips plus suggestions. */
	trips: number;
	/** Trips the user saved; only these appear in the chart filter. */
	storedTrips: number;
}

/** The first need the data does not meet, or `null` when the tab can draw. */
export function missingNeed(
	needs: readonly VizNeed[],
	have: VizHave,
): VizNeed | null {
	return needs.find((need) => have[need] === 0) ?? null;
}

/** Collect steps a Visualize placeholder can send the user to. */
type CollectLink = "locations" | "trips";

interface Placeholder {
	sprite: SpriteName;
	title: string;
	why: string;
	action: { step: CollectLink; label: string };
}

function placeholderFor(need: VizNeed, have: VizHave): Placeholder {
	if (need === "locations") {
		return {
			sprite: "plane",
			title: "No photo location history yet",
			why:
				have.trips > 0
					? `You have ${plural(have.trips, "trip")}, but this view is drawn from photo locations. Import your photo locations to see where you went.`
					: "Import your photo locations to see where you went: this view is drawn from them.",
			action: { step: "locations", label: "Import photo locations" },
		};
	}
	if (have.locations === 0) {
		return {
			sprite: "suitcase",
			title: "No trips yet",
			why: "Trips are built from your passport stamps and photo locations. Import your photo locations first, then build trips to see your journeys.",
			action: { step: "locations", label: "Import photo locations" },
		};
	}
	return {
		sprite: "suitcase",
		title: "No trips yet",
		why: "Build trips to see your journeys: this view replays them stop by stop.",
		action: { step: "trips", label: "Build trips" },
	};
}

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The pixel empty state for a tab whose data is missing, with a button to the Collect step that adds it. */
export function VizEmpty({ need, have }: { need: VizNeed; have: VizHave }) {
	const { sprite, title, why, action } = placeholderFor(need, have);
	return (
		<EmptyState
			art={<PixelArt name={sprite} scale={4} />}
			title={title}
			action={
				<Link
					to="/collect/$step"
					params={{ step: action.step }}
					className="vp-button"
					data-variant="primary"
				>
					{action.label}
				</Link>
			}
		>
			<p>{why}</p>
		</EmptyState>
	);
}

/** A one-line hint when a tab can draw but some data would make it better. */
export function VizHint({
	children,
	step,
	label,
}: {
	children: string;
	step: CollectLink;
	label: string;
}) {
	return (
		<Notice>
			<span>
				{children}{" "}
				<Link to="/collect/$step" params={{ step }}>
					{label}
				</Link>
			</span>
		</Notice>
	);
}
