import { Link } from "@tanstack/react-router";
import { PixelArt } from "@voyput/ui";
import type { Plan } from "./planProgress";
import { usePlan } from "./usePlan";
import "./plan.css";

const number = new Intl.NumberFormat("en");

const STATE_TEXT = { done: "done", next: "next", todo: "to do" } as const;

/** The workflow as a game: steps done, stamps waiting, and what the trips add up to. */
export function YourPlan() {
	const plan = usePlan();
	return plan ? <PlanCard plan={plan} /> : null;
}

export function PlanCard({ plan }: { plan: Plan }) {
	const total = plan.steps.length;
	const complete = plan.doneCount === total;
	return (
		<section
			className="plan"
			aria-labelledby="plan-title"
			data-complete={complete ? "" : undefined}
		>
			<div className="plan-head">
				<h2 id="plan-title" className="plan-title">
					Your plan
				</h2>
				<span className="plan-score">
					{plan.doneCount}/{total} done
				</span>
			</div>
			<div
				className="plan-bar"
				role="progressbar"
				aria-label="Plan progress"
				aria-valuemin={0}
				aria-valuemax={total}
				aria-valuenow={plan.doneCount}
				aria-valuetext={`${plan.doneCount} of ${total} steps done`}
			>
				{plan.steps.map((step) => (
					<span
						key={step.key}
						className="plan-bar-segment"
						data-done={step.done ? "" : undefined}
					/>
				))}
			</div>
			<ol className="plan-steps">
				{plan.steps.map((step, index) => {
					const state = step.done
						? "done"
						: step === plan.next
							? "next"
							: "todo";
					return (
						<li key={step.key} data-state={state}>
							<Link
								to={step.to}
								className="plan-step"
								aria-label={`Step ${index + 1}: ${step.label}, ${STATE_TEXT[state]}`}
							>
								<span className="plan-step-mark" aria-hidden="true">
									{step.done ? "✓" : index + 1}
								</span>
								<span className="plan-step-label">{step.label}</span>
							</Link>
						</li>
					);
				})}
			</ol>
			{complete ? (
				<div className="plan-trophy" role="status">
					<PixelArt name="trophy" scale={4} />
					<span>All steps done</span>
				</div>
			) : null}
			<div className="plan-side">
				<dl className="plan-stats">
					<div>
						<dt>Countries</dt>
						<dd>{number.format(plan.countries)}</dd>
					</div>
					<div>
						<dt>Days abroad</dt>
						<dd>{number.format(plan.daysAbroad)}</dd>
					</div>
					<div>
						<dt>Trips</dt>
						<dd>{number.format(plan.trips)}</dd>
					</div>
				</dl>
				{plan.trips === 0 ? (
					<p className="plan-note">Counted from saved trips.</p>
				) : null}
				{plan.toReview > 0 ? (
					<div className="plan-review">
						<PixelArt name="stamp" scale={3} />
						<span className="plan-review-text">
							Ready for review{" "}
							<strong className="plan-review-count">
								{number.format(plan.toReview)}
							</strong>
						</span>
						<Link
							to="/review"
							className="vp-button"
							data-variant="primary"
							data-size="sm"
							aria-label="Review stamps"
						>
							Review
						</Link>
					</div>
				) : null}
				{plan.toReview === 0 && plan.next ? (
					<div className="plan-review" data-kind="next">
						<PixelArt name="suitcase" scale={3} />
						<span className="plan-review-text">Next: {plan.next.label}</span>
						<Link
							to={plan.next.to}
							className="vp-button"
							data-variant="secondary"
							data-size="sm"
							aria-label={`Go to ${plan.next.label}`}
						>
							Go
						</Link>
					</div>
				) : null}
			</div>
		</section>
	);
}
