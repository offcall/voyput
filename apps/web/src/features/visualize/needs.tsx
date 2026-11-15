import { Link } from "@tanstack/react-router";
import { EmptyState, PixelArt, type SpriteName } from "@voyput/ui";
import type { InsightViewId } from "./views";

/**
 * Data an Insights view cannot draw without:
 * - `locations`: photo locations from the imported location history;
 * - `stays`: stays to replay, stored or suggested (Route, Explore and other stay views).
 */
export type VizNeed = "locations" | "stays";

/** What the user has, counted once by the Insights layout. */
export interface VizHave {
	/** Imported photo locations. */
	locations: number;
	/** Stays the stay views draw from: stored or suggested. */
	stays: number;
	/** Stays the user saved. */
	storedStays: number;
	/** Passport stamps read from photos. */
	stamps: number;
}

/** The first need the data does not meet, or `null` when the tab can draw. */
export function missingNeed(
	needs: readonly VizNeed[],
	have: VizHave,
): VizNeed | null {
	return needs.find((need) => have[need] === 0) ?? null;
}

/** Collect steps a placeholder or hint can send the user to. */
type CollectLink = "locations" | "trips" | "passports";

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
				have.stays > 0
					? `You have ${plural(have.stays, "stay")}, but this view is drawn from photo locations. Import your photo locations to see where you went.`
					: "Import your photo locations to see where you went: this view is drawn from them.",
			action: { step: "locations", label: "Import photo locations" },
		};
	}
	if (have.locations === 0) {
		return {
			sprite: "suitcase",
			title: "No stays yet",
			why: "Stays are built from your passport stamps and photo locations. Import your photo locations first, then check your stays to see your journeys.",
			action: { step: "locations", label: "Import photo locations" },
		};
	}
	return {
		sprite: "suitcase",
		title: "No stays yet",
		why: "Add or check your stays to see your journeys: this view replays them stop by stop.",
		action: { step: "trips", label: "Check stays" },
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

/** A hint: what more data would add, and the Collect step that adds it. */
export interface Hint {
	text: string;
	step: CollectLink;
	label: string;
}

const HINTS = {
	locations: {
		text: "Add photo locations to see cities and routes.",
		step: "locations",
		label: "Add photo locations",
	},
	stamps: {
		text: "Add passport photos for exact border dates.",
		step: "passports",
		label: "Add passport photos",
	},
	suggested: {
		text: "These stays are suggestions from your stamps and photos.",
		step: "trips",
		label: "Check stays",
	},
} as const satisfies Record<string, Hint>;

/**
 * The one hint a view shows, chosen by what data exists: photo locations where
 * they add cities and routes, stamps where they make border dates exact, then a
 * word that the stays are only suggestions. The Map draws photos only: no hint.
 */
export function hintFor(view: InsightViewId, have: VizHave): Hint | null {
	if (view === "map") return null;
	const order =
		view === "calendar"
			? (["stamps", "locations"] as const)
			: (["locations", "stamps"] as const);
	for (const need of order) if (have[need] === 0) return HINTS[need];
	return have.storedStays === 0 ? HINTS.suggested : null;
}

/** A quiet one-line hint with a link to the Collect step that adds the data. */
export function InsightsHint({ hint }: { hint: Hint }) {
	return (
		<p className="vp-insights-hint">
			{hint.text}{" "}
			<Link to="/collect/$step" params={{ step: hint.step }}>
				{hint.label} →
			</Link>
		</p>
	);
}
