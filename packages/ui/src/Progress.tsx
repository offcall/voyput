import { Progress as BaseProgress } from "@base-ui/react/progress";

export function Progress({
	value,
	max = 100,
	label,
}: {
	value: number;
	max?: number;
	label?: string;
}) {
	return (
		<BaseProgress.Root value={value} max={max} aria-label={label}>
			<BaseProgress.Track className="vp-progress-track">
				<BaseProgress.Indicator className="vp-progress-indicator" />
			</BaseProgress.Track>
		</BaseProgress.Root>
	);
}
