import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@voyput/ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { isStepId, type Plan, type StepId } from "../data/plan/planProgress";
import { PlanProvider, useLivePlan } from "../data/plan/usePlan";
import { stepIdOf } from "../features/collect/CollectPage";
import { firstUnfinishedStep } from "../features/collect/steps";
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
import { TOUCH_LAYOUT, useMediaQuery } from "./useMediaQuery";

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

/**
 * Where the Collect link leads: never the Stays step, which has its own item
 * and no Collect stepper. The last source step visited, else the first
 * unfinished one, else the plan's last source step.
 */
export function collectTarget(
	remembered: StepId | null,
	plan: Plan | undefined,
): StepId {
	if (remembered && remembered !== "trips") return remembered;
	if (!plan) return "passports";
	const next = firstUnfinishedStep(plan);
	if (next !== "trips") return next;
	return plan.steps.filter((s) => s.id !== "trips").at(-1)?.id ?? "passports";
}

const VIEW_ICONS: Record<InsightViewId, ReactNode> = {
	journey: icons.journey,
	map: icons.map,
	calendar: icons.calendar,
	stats: icons.stats,
};

export function Layout() {
	const plan = useLivePlan();
	const shared = useMemo(() => ({ plan }), [plan]);
	const [theme, setTheme] = useTheme();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const areas = useAreas(pathname);
	const collectStep = collectTarget(areas.step, plan);
	const inInsights = areas.area === "insights";
	const touch = useMediaQuery(TOUCH_LAYOUT);

	return (
		<AppShell
			brand={<Brand />}
			nav={
				touch ? (
					<TouchTabs plan={plan} areas={areas} collectStep={collectStep} />
				) : (
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
				)
			}
			footer={
				touch ? (
					<ThemeSwitch mode={theme} onChange={setTheme} />
				) : (
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
				)
			}
		>
			{/* Same position on both layouts: crossing 860px must not remount the page. */}
			{touch && inInsights ? <InsightsSwitch /> : null}
			<PlanProvider value={shared}>
				<CountryColoursProvider>
					<Outlet />
				</CountryColoursProvider>
			</PlanProvider>
		</AppShell>
	);
}

/** The logo, leading home (ADR 0025). */
function Brand() {
	return (
		<Link to="/" className="vp-brand-link" aria-label="voyput home">
			<BrandMark />
			<span className="vp-brand-name">VOYPUT</span>
		</Link>
	);
}

/**
 * Phones and tablets: the bottom tab bar holds the four areas, Settings
 * included; the Insights views move to `InsightsSwitch` at the top of the page.
 */
function TouchTabs({
	plan,
	areas,
	collectStep,
}: {
	plan: Plan | undefined;
	areas: ReturnType<typeof useAreas>;
	collectStep: StepId;
}) {
	return (
		<>
			<Link
				to="/collect/$step"
				params={{ step: collectStep }}
				data-area="collect"
				aria-current={areas.area === "collect" ? "page" : undefined}
			>
				<span className="vp-nav-icon">
					{icons.collect}
					{plan ? (
						<span
							className="vp-tab-badge"
							data-done={plan.doneCount === plan.steps.length ? "" : undefined}
							aria-hidden="true"
						>
							{plan.doneCount}/{plan.steps.length}
						</span>
					) : null}
				</span>
				<span className="vp-nav-label">Collect</span>
				{plan ? (
					<span className="vp-visually-hidden">
						, {plan.doneCount} of {plan.steps.length} steps done
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
			</Link>
			<Link
				to="/insights/$view"
				params={{ view: areas.view }}
				data-area="insights"
				aria-current={areas.area === "insights" ? "page" : undefined}
			>
				<span className="vp-nav-icon">{icons.insights}</span>
				<span className="vp-nav-label">Insights</span>
			</Link>
			<Link to="/settings" activeProps={{ "aria-current": "page" }}>
				<span className="vp-nav-icon">{icons.settings}</span>
				<span className="vp-nav-label">Settings</span>
			</Link>
		</>
	);
}

/** Phones and tablets, inside Insights: the four views as one compact switch. */
function InsightsSwitch() {
	return (
		<nav className="vp-insights-switch" aria-label="Insights views">
			{INSIGHT_VIEWS.map((view) => (
				<Link
					key={view.id}
					to="/insights/$view"
					params={{ view: view.id }}
					activeProps={{ "aria-current": "page" }}
				>
					<span className="vp-insights-switch-icon" aria-hidden="true">
						{VIEW_ICONS[view.id]}
					</span>
					{view.label}
				</Link>
			))}
		</nav>
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
