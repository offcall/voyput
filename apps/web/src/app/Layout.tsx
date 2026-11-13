import { Link, Outlet } from "@tanstack/react-router";
import { AppShell } from "@voyput/ui";
import type { ReactNode } from "react";
import { BrandMark, icons } from "./icons";
import "./layout.css";
import { locationCountLabel, type NavCounts, useNavCounts } from "./navCounts";
import { type ThemeMode, useTheme } from "./theme";

export const SECTIONS = [
	{ to: "/import", label: "Import" },
	{ to: "/extract", label: "Extract" },
	{ to: "/review", label: "Review" },
	{ to: "/trips", label: "Trips" },
	{ to: "/visualize", label: "Visualize" },
	{ to: "/settings", label: "Settings" },
] as const;

type Section = (typeof SECTIONS)[number];

const ICONS: Record<Section["to"], ReactNode> = {
	"/import": icons.import,
	"/extract": icons.extract,
	"/review": icons.review,
	"/trips": icons.trips,
	"/visualize": icons.visualize,
	"/settings": icons.settings,
};

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
	const steps = SECTIONS.filter((section) => section.to !== "/settings");
	const tools = SECTIONS.filter((section) => section.to === "/settings");

	const navLink = (section: Section) => {
		const count = countFor(section.to, counts);
		return (
			<Link
				key={section.to}
				to={section.to}
				activeProps={{ "aria-current": "page" }}
			>
				<span className="vp-nav-icon">{ICONS[section.to]}</span>
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
				{section.to === "/import" && counts && counts.locations > 0 ? (
					<span
						className="vp-nav-count"
						aria-hidden="true"
						title={`${counts.locations.toLocaleString("en")} locations`}
					>
						{locationCountLabel(counts.locations)}
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
					voyput
				</>
			}
			nav={
				<>
					<span className="vp-nav-group" aria-hidden="true">
						Workflow
					</span>
					{steps.map(navLink)}
				</>
			}
			footer={
				<>
					<div className="vp-shell-nav">{tools.map(navLink)}</div>
					<ThemeSwitch mode={theme} onChange={setTheme} />
				</>
			}
		>
			<Outlet />
		</AppShell>
	);
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
