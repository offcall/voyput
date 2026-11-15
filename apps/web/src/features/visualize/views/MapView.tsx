import { useNavigate, useSearch } from "@tanstack/react-router";
import { formatInt } from "../charts/format";
import { GlobeChart } from "../charts/GlobeChart";
import { HeatmapChart } from "../charts/HeatmapChart";
import { MapChart } from "../charts/MapChart";
import { Chip, ChipGroup } from "../explore/Chip";
import type { InsightsContext } from "../InsightsPage";
import { isMapMode, type MapMode } from "../views";

const plural = (n: number, one: string, many = `${one}s`) =>
	`${formatInt(n)} ${n === 1 ? one : many}`;

export const MAP_MODE_KEY = "voyput:insights-map";

const LABELS: Record<MapMode, string> = {
	flat: "Flat",
	heat: "Heat",
	globe: "Globe",
};

function storedMode(): MapMode | undefined {
	try {
		const stored = localStorage.getItem(MAP_MODE_KEY);
		return isMapMode(stored) ? stored : undefined;
	} catch {
		return undefined;
	}
}

function storeMode(mode: MapMode) {
	try {
		localStorage.setItem(MAP_MODE_KEY, mode);
	} catch {
		// A browser that refuses storage keeps the choice in the URL only.
	}
}

/**
 * Map: one view, drawn flat, as a heatmap or on a globe. The style is in the
 * URL (`?mode=heat`), and the last choice is remembered for the next visit.
 */
export function MapView({ ctx }: { ctx: InsightsContext }) {
	const search = useSearch({ strict: false });
	const navigate = useNavigate();
	const mode: MapMode =
		(isMapMode(search.mode) ? search.mode : undefined) ??
		storedMode() ??
		"flat";
	const pick = (next: MapMode) => {
		storeMode(next);
		void navigate({
			to: "/insights/$view",
			params: { view: "map" },
			search: (prev) => ({ ...prev, mode: next }),
			replace: true,
		});
	};
	const { data, world } = ctx;
	const days = Object.keys(data.dayCounts).length;
	return (
		<section className="vp-viz-panel" aria-label="Map">
			<div className="vp-insights-map-bar">
				<ChipGroup label="Map style">
					{(Object.keys(LABELS) as MapMode[]).map((m) => (
						<Chip key={m} selected={m === mode} onClick={() => pick(m)}>
							{LABELS[m]}
						</Chip>
					))}
				</ChipGroup>
				<p className="vp-viz-muted">
					{[
						plural(data.countries.length, "country", "countries"),
						plural(data.photoCount, "photo"),
						plural(days, "day with photos", "days with photos"),
						plural(data.movements.length, "period"),
					].join(" · ")}
				</p>
			</div>
			{data.photoCount === 0 ? (
				<p className="vp-viz-muted">No photos fall inside the filter.</p>
			) : null}
			{mode === "flat" ? (
				<MapChart data={data} world={world} />
			) : mode === "heat" ? (
				<HeatmapChart data={data} world={world} />
			) : (
				<GlobeChart data={data} world={world} />
			)}
		</section>
	);
}
