import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@voyput/ui";
import { type ReactNode, useEffect, useState } from "react";
import { stepIdOf } from "../features/collect/CollectPage";
import { firstUnfinishedStep } from "../features/collect/steps";
import { isStepId, type StepId } from "../features/import/plan/planProgress";
import { usePlan } from "../features/import/plan/usePlan";
import { findVizTab, firstVizTab, VIZ_TABS } from "../features/visualize/tabs";
import { CountryColoursProvider } from "./countryColours";
import { BrandMark, icons } from "./icons";
import "./layout.css";
import { type ThemeMode, useTheme } from "./theme";

export type Area = "collect" | "visualize";

/** The Visualize tab id in a path (`/visualize/map` → `map`), if it is a known tab. */
function vizTabOf(pathname: string): string | undefined {
	const match = /^\/visualize\/([^/]+)/.exec(pathname);
	const id = match?.[1];
	return id && findVizTab(id) ? id : undefined;
}

/**
 * The active area and where each area's link leads: the last step or tab visited
 * there. Settings belongs to neither and keeps the last area.
 */
function useAreas(pathname: string) {
	const [last, setLast] = useState<{
		area: Area;
		step: StepId | null;
		tab: string;
	}>({ area: "collect", step: null, tab: firstVizTab().id });
	const id = stepIdOf(pathname);
	const step = isStepId(id) ? id : null;
	const tab = vizTabOf(pathname);
	const inCollect = pathname === "/collect" || pathname.startsWith("/collect/");
	const inVisualize =
		pathname === "/visualize" || pathname.startsWith("/visualize/");
	useEffect(() => {
		if (step) setLast((prev) => ({ ...prev, area: "collect", step }));
		else if (tab) setLast((prev) => ({ ...prev, area: "visualize", tab }));
	}, [step, tab]);
	const area: Area = inCollect
		? "collect"
		: inVisualize
			? "visualize"
			: last.area;
	return { area, step: last.step, tab: last.tab };
}

export function Layout() {
	const plan = usePlan();
	const [theme, setTheme] = useTheme();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const areas = useAreas(pathname);
	const inCollect = pathname === "/collect" || pathname.startsWith("/collect/");
	const collectStep =
		areas.step ?? (plan ? firstUnfinishedStep(plan) : "passports");

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
					<Link
						to="/collect/$step"
						params={{ step: collectStep }}
						data-area="collect"
						aria-current={inCollect ? "page" : undefined}
					>
						<span className="vp-nav-icon">{icons.collect}</span>
						<span className="vp-nav-label">Collect</span>
						{plan ? (
							<span
								className="vp-nav-count"
								aria-hidden="true"
								title={`${plan.doneCount} of ${plan.steps.length} steps done`}
							>
								{plan.doneCount}/{plan.steps.length}
							</span>
						) : null}
					</Link>
					{areas.area === "collect" ? (
						// Phones only: the bar shows Collect and this way to Visualize.
						<Link
							to="/visualize/$tab"
							params={{ tab: areas.tab }}
							className="vp-nav-phone"
							data-area="visualize"
						>
							<span className="vp-nav-icon">{icons.visualize}</span>
							<span className="vp-nav-label">Visualize</span>
						</Link>
					) : null}
					<span className="vp-nav-group" aria-hidden="true">
						Visualize
					</span>
					{VIZ_TABS.map((tab) => (
						<Link
							key={tab.id}
							ref={tab.id === areas.tab ? keepInView : undefined}
							to="/visualize/$tab"
							params={{ tab: tab.id }}
							className={
								areas.area === "collect" ? "vp-nav-desktop" : undefined
							}
							activeProps={{ "aria-current": "page" }}
						>
							<span className="vp-nav-icon">{tab.icon}</span>
							<span className="vp-nav-label">{tab.label}</span>
						</Link>
					))}
				</>
			}
			footer={
				<>
					<div className="vp-shell-nav">
						<Link to="/settings" activeProps={{ "aria-current": "page" }}>
							<span className="vp-nav-icon">{icons.settings}</span>
							<span className="vp-nav-label">Settings</span>
						</Link>
					</div>
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
