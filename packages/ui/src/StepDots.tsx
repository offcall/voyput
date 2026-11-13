/** Square pager dots for a multi-step flow; `current` is 0-based. */
export function StepDots({
	count,
	current,
	label = `Step ${current + 1} of ${count}`,
}: {
	count: number;
	current: number;
	label?: string;
}) {
	return (
		<span className="vp-step-dots" role="img" aria-label={label}>
			{Array.from({ length: count }, (_, index) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: dots have no identity besides their place
					key={index}
					className="vp-step-dot"
					data-state={
						index < current ? "done" : index === current ? "current" : undefined
					}
				/>
			))}
		</span>
	);
}
