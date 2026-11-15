import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@voyput/ui";
import { type ReactNode, useEffect, useState } from "react";
import { stepIdOf } from "../features/collect/CollectPage";
import { firstUnfinishedStep } from "../features/collect/steps";
import { isStepId, type StepId } from "../features/import/plan/planProgress";
import { usePlan } from "../features/import/plan/usePlan";
import {
	FIRST_VIEW,
	findView,
	INSIGHT_VIEWS,
	type InsightViewId,
} from "../features/visualize/views";
import { CountryColoursProvider } from "./countryColours";
import { BrandMark, icons } from "./icons";
import "./layout.css";
import { type ThemeMode, useTheme } from "./theme";

export type Area = "collect" | "stays" | "insights";

/** The Insights view id in a path (`/insights/map` → `map`), if it is a known view. */
function viewOf(pathname: string): InsightViewId | undefined {
	const id = /^\/insights\/([^/]+)/.exec(pathname)?.[1];
	return id ? findView(id)?.id : undefined;
}

/** The area a path belongs to; Settings belongs to none. */
export function areaOf(pathname: string): Area | null {
	if (pathname === "/collect/trips" || pathname.startsWith("/collect/trips/"))
		return "stays";
	if (pathname === "/collect" || pathname.startsWith("/collect/"))
		return "collect";
	if (pathname === "/insights" || pathname.startsWith("/insights/"))
		return "insights";
	return null;
}

/**
 * The active area, and where the Collect and Insights links lead: the last step
 * (Stays aside) or view visited there.
 */
function useAreas(pathname: string) {
	const [last, setLast] = useState<{
		step: StepId | null;
		view: InsightViewId;
	}>({ step: null, view: FIRST_VIEW });
	const id = stepIdOf(pathname);
	const step = isStepId(id) && id !== "trips" ? id : null;
	const view = viewOf(pathname);
	useEffect(() => {
		if (step) setLast((prev) => ({ ...prev, step }));
		if (view) setLast((prev) => ({ ...prev, view }));
	}, [step, view]);
	return { area: areaOf(pathname), ...last };
}

const VIEW_ICONS: Record<InsightViewId, ReactNode> = {
	journey: icons.journey,
	map: icons.map,
	calendar: icons.calendar,
	stats: icons.stats,
};

export function Layout() {
	const plan = usePlan();
	const [theme, setTheme] = useTheme();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const areas = useAreas(pathname);
	const collectStep =
		areas.step ?? (plan ? firstUnfinishedStep(plan) : "passports");
	const inInsights = areas.area === "insights";

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
						aria-current={areas.area === "collect" ? "page" : undefined}
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
					<Link
						to="/collect/$step"
						params={{ step: "trips" }}
						data-area="stays"
						aria-current={areas.area === "stays" ? "page" : undefined}
					>
						<span className="vp-nav-icon">{icons.stays}</span>
						<span className="vp-nav-label">Stays</span>
						{plan && plan.stays > 0 ? (
							<span
								className="vp-nav-count"
								aria-hidden="true"
								title={`${plan.stays} saved stays`}
							>
								{plan.stays}
							</span>
						) : null}
					</Link>
					{inInsights ? (
						// Inside Insights the views below are the links; this only heads them.
						<span className="vp-nav-parent vp-nav-desktop">
							<span className="vp-nav-icon">{icons.insights}</span>
							<span className="vp-nav-label">Insights</span>
						</span>
					) : (
						<Link
							to="/insights/$view"
							params={{ view: areas.view }}
							data-area="insights"
						>
							<span className="vp-nav-icon">{icons.insights}</span>
							<span className="vp-nav-label">Insights</span>
						</Link>
					)}
					{INSIGHT_VIEWS.map((view) => (
						<Link
							key={view.id}
							to="/insights/$view"
							params={{ view: view.id }}
							className={
								inInsights ? "vp-nav-sub" : "vp-nav-sub vp-nav-desktop"
							}
							activeProps={{ "aria-current": "page" }}
						>
							<span className="vp-nav-icon">{VIEW_ICONS[view.id]}</span>
							<span className="vp-nav-label">{view.label}</span>
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
					<p
						className="vp-local-note"
						title="Your data never leaves this browser."
					>
						{icons.lock}
						<span>Local only</span>
					</p>
				</>
			}
		>
			<CountryColoursProvider>
				<Outlet />
			</CountryColoursProvider>
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
