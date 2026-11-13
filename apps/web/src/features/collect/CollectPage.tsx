import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import { PixelArt, Stack } from "@voyput/ui";
import { DemoLoadedProvider } from "../import/demoLoaded";
import type { Plan } from "../import/plan/planProgress";
import { usePlan } from "../import/plan/usePlan";
import { Stepper } from "./Stepper";
import { SuccessHeader } from "./SuccessHeader";
import { COLLECT_STEPS, type CollectStep, firstUnfinishedStep } from "./steps";
import "./collect.css";

/** The step id in a path (`/collect/trips/abc` → `trips`), if any. */
export function stepIdOf(pathname: string): string | undefined {
	return /^\/collect\/([^/]+)/.exec(pathname)?.[1];
}

/**
 * The `/collect` layout: the success header, the stepper, one step and Back/Next.
 * It renders the step itself (no outlet), so a step such as Trips stays mounted
 * while its own part of the URL (`/collect/trips/<id>`) changes.
 */
export function CollectPage() {
	const plan = usePlan();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const index = COLLECT_STEPS.findIndex(
		(step) => step.id === stepIdOf(pathname),
	);
	const step = COLLECT_STEPS[index];

	// `/collect` itself opens the first step that is not done, once the plan is read.
	// Only there: while leaving Collect this layout still renders for another path.
	if (!step)
		return plan && /^\/collect\/?$/.test(pathname) ? (
			<Navigate
				to="/collect/$step"
				params={{ step: firstUnfinishedStep(plan) }}
				replace
			/>
		) : null;

	return (
		<DemoLoadedProvider>
			<Stack>
				<SuccessHeader plan={plan} current={step.id} />
				<Stepper plan={plan} current={step.id} />
				<section className="collect-step" aria-labelledby="collect-step-title">
					<header className="collect-step-head">
						<PixelArt name={step.sprite} scale={2} />
						<div>
							<h2 id="collect-step-title">{step.title}</h2>
							<p>{step.description}</p>
						</div>
					</header>
					{step.render()}
				</section>
				<StepNav
					previous={COLLECT_STEPS[index - 1]}
					next={COLLECT_STEPS[index + 1]}
					plan={plan}
				/>
			</Stack>
		</DemoLoadedProvider>
	);
}

/** Back and Next under the step; after the last step Next leads to Visualize. */
function StepNav({
	previous,
	next,
	plan,
}: {
	previous: CollectStep | undefined;
	next: CollectStep | undefined;
	plan: Plan | undefined;
}) {
	return (
		<nav className="collect-step-nav" aria-label="Step">
			{previous ? (
				<Link
					to="/collect/$step"
					params={{ step: previous.id }}
					className="vp-button"
					data-variant="secondary"
				>
					← {previous.label}
				</Link>
			) : (
				<span />
			)}
			{next ? (
				<Link
					to="/collect/$step"
					params={{ step: next.id }}
					className="vp-button"
					data-variant="primary"
				>
					Next: {next.label} →
				</Link>
			) : (
				<Link
					to="/visualize"
					className="vp-button"
					data-variant={plan?.next ? "secondary" : "primary"}
				>
					Open Visualize →
				</Link>
			)}
		</nav>
	);
}
