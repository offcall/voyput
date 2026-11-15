import { Link } from "@tanstack/react-router";
import type { Plan, StepId, StepState } from "../import/plan/planProgress";
import { findStep, stepCount } from "./steps";

const STATE_TEXT: Record<StepState, string> = {
	done: "done",
	attention: "needs attention",
	todo: "to do",
};

/**
 * The Collect steps for the chosen sources as one row of links: a dot (done, needs
 * attention or to do), the name and a short status. The open step is highlighted
 * (`aria-current="page"`). Scrolls sideways on narrow screens.
 * `list`: one step per row with every status, for the phone's steps sheet.
 */
export function Stepper({
	plan,
	current,
	variant = "row",
	onNavigate,
}: {
	plan: Plan | undefined;
	current: StepId;
	variant?: "row" | "list";
	/** Called when a step link is followed, e.g. to close the sheet. */
	onNavigate?: () => void;
}) {
	const list = variant === "list";
	return (
		<nav
			className="collect-stepper"
			data-variant={variant}
			aria-label={list ? "All Collect steps" : "Collect steps"}
		>
			<ol>
				{(plan?.steps ?? []).map(({ id, state }, index) => {
					const step = findStep(id);
					if (!step || !plan) return null;
					const count = stepCount(id, plan);
					const isCurrent = id === current;
					return (
						<li
							key={id}
							data-state={state}
							data-current={isCurrent ? "" : undefined}
							ref={isCurrent && !list ? keepInView : undefined}
						>
							<Link
								to="/collect/$step"
								params={{ step: id }}
								className="collect-stepper-link"
								onClick={onNavigate}
								aria-label={`Step ${index + 1}: ${step.label}, ${STATE_TEXT[state]}${count ? `, ${count}` : ""}`}
							>
								<span className="collect-stepper-mark" aria-hidden="true">
									{state === "done" ? "✓" : state === "attention" ? "!" : ""}
								</span>
								<span className="collect-stepper-label" aria-hidden="true">
									{step.label}
								</span>
								{/* The dot says done or to do; a status only where it matters. */}
								{!list && !isCurrent && state !== "attention" ? null : (
									<span className="collect-stepper-count" aria-hidden="true">
										{count ?? STATE_TEXT[state]}
									</span>
								)}
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
