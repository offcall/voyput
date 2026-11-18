import { Navigate, useNavigate, useRouterState } from "@tanstack/react-router";
import { Stack } from "@voyput/ui";
import type { ReactNode } from "react";
import { saveSources } from "../../data/plan/sources";
import { usePlan } from "../../data/plan/usePlan";
import { useDb } from "../../db/DbContext";
import { DemoActionsProvider, useDemoActions } from "../demo/DemoActions";
import { DemoLoadedProvider } from "../import/demoLoaded";
import { CollectBar, SourcesControl } from "./CollectBar";
import { SourcesChoice } from "./SourcesChoice";
import { COLLECT_STEPS, firstUnfinishedStep } from "./steps";
import "./collect.css";

/** The step id in a path (`/collect/trips/abc` → `trips`), if any. */
export function stepIdOf(pathname: string): string | undefined {
	return /^\/collect\/([^/]+)/.exec(pathname)?.[1];
}

/**
 * The `/collect` layout: the Collect bar and one step. It renders the step itself
 * (no outlet), so a step such as Stays stays mounted while its own part of the URL
 * (`/collect/trips/<id>`) changes. Stays is its own section: no Collect bar there.
 */
export function CollectPage() {
	return (
		<DemoLoadedProvider>
			<DemoActionsProvider>
				<CollectContent />
			</DemoActionsProvider>
		</DemoLoadedProvider>
	);
}

function CollectContent() {
	const plan = usePlan();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const step = COLLECT_STEPS.find((s) => s.id === stepIdOf(pathname));

	if (!step) {
		// Only `/collect` itself: while leaving Collect this layout still renders for another path.
		if (!plan || !/^\/collect\/?$/.test(pathname)) return null;
		// First visit, nothing stored and nothing chosen: ask what the user has.
		if (!plan.sources && !plan.hasData) return <FirstVisit />;
		return (
			<Navigate
				to="/collect/$step"
				params={{ step: firstUnfinishedStep(plan) }}
				replace
			/>
		);
	}

	if (step.id === "trips") return <>{step.render()}</>;

	return (
		<Stack>
			<CollectBar plan={plan} current={step.id} />
			<StepSection
				title={step.title}
				description={step.description}
				aside={plan ? <SourcesControl plan={plan} /> : null}
			>
				{step.render()}
			</StepSection>
		</Stack>
	);
}

function StepSection({
	title,
	description,
	aside,
	children,
}: {
	title: string;
	description: string;
	/** Quiet controls at the right of the title. */
	aside: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="collect-step" aria-labelledby="collect-step-title">
			<header className="collect-step-head">
				<div>
					<h2 id="collect-step-title">{title}</h2>
					<p>{description}</p>
				</div>
				{aside}
			</header>
			{children}
		</section>
	);
}

/** `/collect` before anything is stored: the Sources choice, then the first step it needs. */
function FirstVisit() {
	const db = useDb();
	const navigate = useNavigate();
	const demo = useDemoActions();
	return (
		<section className="collect-first" aria-labelledby="collect-first-title">
			<h1 id="collect-first-title" className="collect-first-title">
				What do you have?
			</h1>
			<p className="collect-muted">
				Start with one source and add the other later. Everything stays in this
				browser.
			</p>
			<SourcesChoice
				current={null}
				onChosen={(sources) =>
					void navigate({
						to: "/collect/$step",
						params: { step: sources === "photos" ? "locations" : "passports" },
					})
				}
				demoBusy={demo.state.kind === "busy"}
				onDemo={async () => {
					await saveSources(db, "both");
					if (await demo.load())
						void navigate({ to: "/collect/$step", params: { step: "review" } });
				}}
			/>
			{demo.state.kind === "error" ? (
				<p role="alert" className="collect-sources-error">
					{demo.state.message}
				</p>
			) : null}
		</section>
	);
}
