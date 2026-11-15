import { Link } from "@tanstack/react-router";
import { Dialog, PixelArt, PixelSky } from "@voyput/ui";
import { useState } from "react";
import { useDemoActions } from "../demo/DemoActions";
import type { Plan, StepId } from "../import/plan/planProgress";
import { SOURCE_LABELS } from "../import/plan/sources";
import { SourcesChoice } from "./SourcesChoice";
import { Stepper } from "./Stepper";
import { findStep, nextAction } from "./steps";

/**
 * The top of Collect: the title on a pixel sky with a suitcase (a trophy once
 * every step is done), then one row with the steps for the chosen sources and one
 * next action.
 */
export function CollectBar({
	plan,
	current,
}: {
	plan: Plan | undefined;
	current: StepId;
}) {
	return (
		<header
			className="collect-bar-frame"
			data-complete={plan && !plan.next ? "" : undefined}
		>
			<PixelSky variant="band" height={56}>
				<div className="vp-sky-band">
					<h1>Collect</h1>
					<PixelArt
						name={plan && !plan.next ? "trophy" : "suitcase"}
						scale={3}
						className="vp-sky-band-art collect-bar-art"
					/>
				</div>
			</PixelSky>
			<div className="collect-bar">
				<Stepper plan={plan} current={current} />
				<div className="collect-bar-end">
					{plan ? <NextAction plan={plan} current={current} /> : null}
				</div>
			</div>
		</header>
	);
}

/**
 * The one button for what to do next: the first step not done. On that step itself
 * the page holds the action, so the button turns quiet and leads to the step after.
 */
function NextAction({ plan, current }: { plan: Plan; current: StepId }) {
	if (!plan.next)
		return (
			<Link
				to="/visualize"
				className="vp-button"
				data-variant="primary"
				data-size="sm"
			>
				See your insights →
			</Link>
		);
	if (plan.next.id !== current)
		return (
			<Link
				to="/collect/$step"
				params={{ step: plan.next.id }}
				className="vp-button"
				data-variant="primary"
				data-size="sm"
			>
				{nextAction(plan.next.id, plan)} →
			</Link>
		);
	const index = plan.steps.findIndex((step) => step.id === current);
	const following = findStep(plan.steps[index + 1]?.id);
	return following ? (
		<Link
			to="/collect/$step"
			params={{ step: following.id }}
			className="vp-button"
			data-variant="secondary"
			data-size="sm"
		>
			Next: {following.label} →
		</Link>
	) : null;
}

/** "Sources: Both · change": a quiet link that opens the Sources choice. */
export function SourcesControl({ plan }: { plan: Plan }) {
	const [open, setOpen] = useState(false);
	const demo = useDemoActions();
	const label = SOURCE_LABELS[plan.sources ?? "both"];
	return (
		<>
			<button
				type="button"
				className="collect-link collect-sources-link"
				onClick={() => setOpen(true)}
			>
				Sources: {label} · change
			</button>
			<Dialog open={open} onOpenChange={setOpen} title="What do you have?">
				<p>
					Start with one source and add the other later. Everything stays in
					this browser.
				</p>
				<SourcesChoice
					current={plan.sources}
					onChosen={() => setOpen(false)}
					demoBusy={demo.state.kind === "busy"}
					onDemo={() => {
						setOpen(false);
						void demo.load();
					}}
				/>
			</Dialog>
		</>
	);
}
