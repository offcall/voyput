import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@voyput/ui";
import { type ReactNode, useEffect, useState } from "react";
import { useDb } from "../db/DbContext";
import { findVizTab, firstVizTab, VIZ_TABS } from "../features/visualize/tabs";
import { CountryColoursProvider } from "./countryColours";
import { BrandMark, icons } from "./icons";
import "./layout.css";
import {
	compactCount,
	locationCountLabel,
	type NavCounts,
	useNavCounts,
} from "./navCounts";
import { markVisualized } from "./planStore";
import { type ThemeMode, useTheme } from "./theme";

/** The Collect area's pages, in workflow order. */
export const COLLECT_SECTIONS = [
	{ to: "/import", label: "Import" },
	{ to: "/extract", label: "Extract" },
	{ to: "/review", label: "Review" },
	{ to: "/trips", label: "Trips" },
] as const;

const SETTINGS = { to: "/settings", label: "Settings" } as const;

type Section = (typeof COLLECT_SECTIONS)[number] | typeof SETTINGS;
type CollectPath = (typeof COLLECT_SECTIONS)[number]["to"];

export type Area = "collect" | "visualize";

const ICONS: Record<Section["to"], ReactNode> = {
	"/import": icons.import,
	"/extract": icons.extract,
	"/review": icons.review,
	"/trips": icons.trips,
	"/settings": icons.settings,
};

/** The Collect page a path belongs to (`/trips/abc` → `/trips`), if any. */
function collectPathOf(pathname: string): CollectPath | undefined {
	return COLLECT_SECTIONS.find(
		(section) =>
			pathname === section.to || pathname.startsWith(`${section.to}/`),
	)?.to;
}

/** The Visualize tab id in a path (`/visualize/map` → `map`), if it is a known tab. */
function vizTabOf(pathname: string): string | undefined {
	const match = /^\/visualize\/([^/]+)/.exec(pathname);
	const id = match?.[1];
	return id && findVizTab(id) ? id : undefined;
}

/**
 * The active area and where each area's switch leads: the last page visited there,
 * or its first page. Settings belongs to neither and keeps the last area.
 */
function useAreas(pathname: string) {
	const [last, setLast] = useState<{
		area: Area;
		collect: CollectPath;
		tab: string;
	}>({ area: "collect", collect: "/import", tab: firstVizTab().id });
	const collect = collectPathOf(pathname);
	const tab = vizTabOf(pathname);
	const inVisualize =
		pathname === "/visualize" || pathname.startsWith("/visualize/");
	useEffect(() => {
		if (collect) setLast((prev) => ({ ...prev, area: "collect", collect }));
		else if (tab) setLast((prev) => ({ ...prev, area: "visualize", tab }));
	}, [collect, tab]);
	const area: Area = collect
		? "collect"
		: inVisualize
			? "visualize"
			: last.area;
	return { area, collect: last.collect, tab: last.tab };
}

/** The number next to a section, or null when there is nothing worth showing. */
function countFor(to: Section["to"], counts: NavCounts | undefined) {
	if (!counts) return null;
	const value =
		to === "/import"
			? counts.photos
			: to === "/extract"
				? counts.toExtract
				: to === "/review"
					? counts.toReview
					: to === "/trips"
						? counts.trips
						: 0;
	return value > 0 ? value : null;
}

const COUNT_TITLES: Partial<Record<Section["to"], string>> = {
	"/import": "photos",
	"/extract": "photos to extract",
	"/review": "stamps to review",
	"/trips": "saved trips",
};

export function Layout() {
	const counts = useNavCounts();
	const [theme, setTheme] = useTheme();
	const db = useDb();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const trips = counts?.trips ?? 0;
	// Opening Visualize with saved trips ticks the last step of the Import plan.
	useEffect(() => {
		if (pathname.startsWith("/visualize") && trips > 0)
			void markVisualized(db).catch(() => undefined);
	}, [db, pathname, trips]);
	const areas = useAreas(pathname);
	const navLink = (section: Section) => {
		const count = countFor(section.to, counts);
		const locations =
			section.to === "/import" && counts && counts.locations > 0
				? counts.locations
				: null;
		return (
			<Link
				key={section.to}
				to={section.to}
				activeProps={{ "aria-current": "page" }}
			>
				<span className="vp-nav-icon">
					{ICONS[section.to]}
					{count !== null || locations !== null ? (
						<span className="vp-nav-badges" aria-hidden="true">
							{count !== null ? (
								<span className="vp-nav-badge">{compactCount(count)}</span>
							) : null}
							{locations !== null ? (
								<span className="vp-nav-badge" data-kind="locations">
									{icons.pin}
									{compactCount(locations)}
								</span>
							) : null}
						</span>
					) : null}
				</span>
				<span className="vp-nav-label">{section.label}</span>
				{count !== null ? (
					<span
						className="vp-nav-count"
						aria-hidden="true"
						title={`${count} ${COUNT_TITLES[section.to] ?? ""}`}
					>
						{section.to === "/trips" ? `${count} saved` : count}
					</span>
				) : null}
				{locations !== null ? (
					<span
						className="vp-nav-count"
						aria-hidden="true"
						title={`${locations.toLocaleString("en")} locations`}
					>
						{locationCountLabel(locations)}
					</span>
				) : null}
			</Link>
		);
	};

	return (
		<AppShell
			brand={
				<>
					<BrandMark />
					<span className="vp-brand-name">VOYPUT</span>
				</>
			}
			nav={
				<>
					<AreaSwitch
						area={areas.area}
						collect={areas.collect}
						tab={areas.tab}
					/>
					{areas.area === "collect" ? (
						<>
							<span className="vp-nav-group" aria-hidden="true">
								Collect
							</span>
							{COLLECT_SECTIONS.map(navLink)}
						</>
					) : (
						<>
							<span className="vp-nav-group" aria-hidden="true">
								Visualize
							</span>
							{VIZ_TABS.map((tab) => (
								<Link
									key={tab.id}
									ref={tab.id === areas.tab ? keepInView : undefined}
									to="/visualize/$tab"
									params={{ tab: tab.id }}
									activeProps={{ "aria-current": "page" }}
								>
									<span className="vp-nav-icon">{tab.icon}</span>
									<span className="vp-nav-label">{tab.label}</span>
								</Link>
							))}
						</>
					)}
				</>
			}
			footer={
				<>
					<div className="vp-shell-nav">{navLink(SETTINGS)}</div>
					<ThemeSwitch mode={theme} onChange={setTheme} />
				</>
			}
		>
			<CountryColoursProvider>
				<Outlet />
			</CountryColoursProvider>
		</AppShell>
	);
}

/**
 * The Collect / Visualize switch: a segmented pill in the sidebar; on phones only the
 * other area shows, as the first tab of the bottom bar.
 */
function AreaSwitch({
	area,
	collect,
	tab,
}: {
	area: Area;
	collect: CollectPath;
	tab: string;
}) {
	const current = (value: Area) =>
		area === value ? ({ "aria-current": "true" } as const) : {};
	return (
		<fieldset className="vp-area-switch">
			<legend className="vp-visually-hidden">Area</legend>
			<Link to={collect} className="vp-area-link" {...current("collect")}>
				<span className="vp-nav-icon">{icons.collect}</span>
				<span className="vp-nav-label">Collect</span>
			</Link>
			<Link
				to="/visualize/$tab"
				params={{ tab }}
				className="vp-area-link"
				{...current("visualize")}
			>
				<span className="vp-nav-icon">{icons.visualize}</span>
				<span className="vp-nav-label">Visualize</span>
			</Link>
		</fieldset>
	);
}

/** The phone tab bar scrolls in Visualize: bring the open tab into view. */
function keepInView(link: HTMLAnchorElement | null) {
	if (typeof link?.scrollIntoView === "function")
		link.scrollIntoView({ block: "nearest", inline: "nearest" });
}

const THEMES: { mode: ThemeMode; label: string; icon: ReactNode }[] = [
	{ mode: "light", label: "Light theme", icon: icons.sun },
	{ mode: "system", label: "System theme", icon: icons.system },
	{ mode: "dark", label: "Dark theme", icon: icons.moon },
];

function ThemeSwitch({
	mode,
	onChange,
}: {
	mode: ThemeMode;
	onChange: (mode: ThemeMode) => void;
}) {
	return (
		<fieldset className="vp-theme-switch">
			<legend className="vp-visually-hidden">Theme</legend>
			{THEMES.map((theme) => (
				<button
					key={theme.mode}
					type="button"
					aria-label={theme.label}
					title={theme.label}
					aria-pressed={mode === theme.mode}
					onClick={() => onChange(theme.mode)}
				>
					{theme.icon}
				</button>
			))}
		</fieldset>
	);
}
