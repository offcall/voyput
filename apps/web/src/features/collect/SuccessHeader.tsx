import { Link } from "@tanstack/react-router";
import { PixelArt, PixelSky } from "@voyput/ui";
import type { Plan, StepId } from "../import/plan/planProgress";
import { COLLECT_STEPS, nextAction } from "./steps";

const number = new Intl.NumberFormat("en");

/**
 * The top of Collect: how far the whole procedure is, what it adds up to so far
 * and one next action; a trophy and a way to Visualize once every step is done.
 */
export function SuccessHeader({
	plan,
	current,
}: {
	plan: Plan | undefined;
	current: StepId;
}) {
	const total = COLLECT_STEPS.length;
	const doneCount = plan?.doneCount ?? 0;
	const complete = plan !== undefined && plan.next === null;
	return (
		<header className="collect-hero" data-complete={complete ? "" : undefined}>
			<PixelSky height={96}>
				<div className="collect-hero-sky">
					<h1>Collect</h1>
					<PixelArt
						name={complete ? "trophy" : "suitcase"}
						scale={4}
						className="collect-hero-art"
					/>
				</div>
			</PixelSky>
			<div className="collect-hero-body">
				<p className="collect-hero-lead">
					{complete
						? "Your travel history is ready."
						: "From passport photos to stays, in five steps. Everything stays in this browser."}
				</p>
				<div className="collect-hero-progress">
					<span className="collect-hero-score">
						{doneCount}/{total}
					</span>
					<div
						className="collect-hero-bar"
						role="progressbar"
						aria-label="Collect progress"
						aria-valuemin={0}
						aria-valuemax={total}
						aria-valuenow={doneCount}
						aria-valuetext={`${doneCount} of ${total} steps done`}
					>
						{COLLECT_STEPS.map((step) => (
							<span
								key={step.id}
								data-done={
									plan?.steps.find((s) => s.id === step.id)?.done
										? ""
										: undefined
								}
							/>
						))}
					</div>
				</div>
				{plan ? <Stats plan={plan} /> : null}
				{plan ? <NextAction plan={plan} current={current} /> : null}
			</div>
		</header>
	);
}

function Stats({ plan }: { plan: Plan }) {
	const noStays = plan.stays === 0;
	const stats = [
		{
			label: "Countries",
			value: number.format(plan.countries),
			hint:
				plan.countriesFrom === "stays" ? "in saved stays" : "in your photos",
		},
		{
			label: "Days abroad",
			value: noStays ? "–" : number.format(plan.daysAbroad),
			hint: noStays ? "after stays" : "in saved stays",
		},
		{
			label: "Stays",
			value: number.format(plan.stays),
			hint: "saved",
		},
		{
			label: "To do",
			value: number.format(plan.toDo),
			hint: plan.toDo === 1 ? "thing left" : "things left",
		},
	];
	return (
		<dl className="collect-hero-stats">
			{stats.map((stat) => (
				<div key={stat.label}>
					<dt>{stat.label}</dt>
					<dd>{stat.value}</dd>
					<dd className="collect-hero-hint">{stat.hint}</dd>
				</div>
			))}
		</dl>
	);
}

/** One clear next step: a link to the first unfinished step, or to Visualize when done. */
function NextAction({ plan, current }: { plan: Plan; current: StepId }) {
	if (!plan.next)
		return (
			<div className="collect-hero-next" role="status" data-kind="done">
				<PixelArt name="sparkle" scale={3} />
				<span className="collect-hero-next-text">
					All five steps done. Time to look at your travels.
				</span>
				<Link to="/visualize" className="vp-button" data-variant="primary">
					Open Visualize
				</Link>
			</div>
		);
	const action = nextAction(plan.next.id, plan);
	if (plan.next.id === current)
		return (
			<div className="collect-hero-next" data-kind="here">
				<PixelArt name="star" scale={2} />
				<span className="collect-hero-next-text">
					<span className="collect-hero-next-label">Now</span> {action}{" "}
					<span aria-hidden="true">↓</span>
				</span>
			</div>
		);
	return (
		<div className="collect-hero-next">
			<PixelArt name="star" scale={2} />
			<span className="collect-hero-next-text">
				<span className="collect-hero-next-label">Next</span> {action}
			</span>
			<Link
				to="/collect/$step"
				params={{ step: plan.next.id }}
				className="vp-button"
				data-variant="primary"
				aria-label={action}
			>
				Go
			</Link>
		</div>
	);
}
