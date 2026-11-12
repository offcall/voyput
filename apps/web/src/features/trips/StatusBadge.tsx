import { Badge } from "@voyput/ui";

export function StatusBadge({
	confirmed,
	stored,
}: {
	confirmed: boolean;
	stored: boolean;
}) {
	return confirmed ? (
		<Badge tone="good">Confirmed</Badge>
	) : stored ? (
		<Badge tone="warn">Draft</Badge>
	) : (
		<Badge>Suggested</Badge>
	);
}
