import { Link } from "@tanstack/react-router";
import type { Plan, StepId, StepState } from "../import/plan/planProgress";
import { COLLECT_STEPS, stepCount } from "./steps";

const STATE_TEXT: Record<StepState, string> = {
	done: "done",
	attention: "needs attention",
	todo: "to do",
};

/**
 * The five Collect steps as links: done, needs attention or to do, with a count each.
 * The open step is the router's active link (`aria-current="page"`). Scrolls sideways on narrow screens.
 */
export function Stepper({
	plan,
	current,
}: {
	plan: Plan | undefined;
	current: StepId;
}) {
	return (
		<nav className="collect-stepper" aria-label="Collect steps">
			<ol>
				{COLLECT_STEPS.map((step, index) => {
					const state =
						plan?.steps.find((s) => s.id === step.id)?.state ?? "todo";
					const count = plan ? stepCount(step.id, plan) : null;
					const isCurrent = step.id === current;
					return (
						<li
							key={step.id}
							data-state={state}
							data-current={isCurrent ? "" : undefined}
							ref={isCurrent ? keepInView : undefined}
						>
							<Link
								to="/collect/$step"
								params={{ step: step.id }}
								className="collect-stepper-link"
								aria-label={`Step ${index + 1}: ${step.label}, ${STATE_TEXT[state]}${count ? `, ${count}` : ""}`}
							>
								<span className="collect-stepper-mark" aria-hidden="true">
									{state === "done"
										? "✓"
										: state === "attention"
											? "!"
											: index + 1}
								</span>
								<span className="collect-stepper-text" aria-hidden="true">
									<span className="collect-stepper-label">{step.label}</span>
									<span className="collect-stepper-count">
										{count ?? STATE_TEXT[state]}
									</span>
								</span>
							</Link>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}

/** On a phone the stepper scrolls: bring the open step into view. */
function keepInView(item: HTMLLIElement | null) {
	if (typeof item?.scrollIntoView === "function")
		item.scrollIntoView({ block: "nearest", inline: "nearest" });
}
