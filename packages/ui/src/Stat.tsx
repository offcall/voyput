import type { ReactNode } from "react";

/** One key number with a label, e.g. "Locations 2 467". */
export function Stat({
	label,
	value,
	hint,
}: {
	label: ReactNode;
	value: ReactNode;
	hint?: ReactNode;
}) {
	return (
		<div className="vp-stat">
			<span className="vp-stat-label">{label}</span>
			<span className="vp-stat-value">{value}</span>
			{hint ? <span className="vp-stat-hint">{hint}</span> : null}
		</div>
	);
}

/** Lays out Stats in a responsive row. */
export function StatGroup({ children }: { children: ReactNode }) {
	return <div className="vp-stats">{children}</div>;
}
