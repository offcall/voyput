import { Link, Outlet } from "@tanstack/react-router";
import { AppShell } from "@voyput/ui";

export const SECTIONS = [
	{ to: "/import", label: "Import" },
	{ to: "/extract", label: "Extract" },
	{ to: "/review", label: "Review" },
	{ to: "/trips", label: "Trips" },
	{ to: "/visualize", label: "Visualize" },
	{ to: "/settings", label: "Settings" },
] as const;

export function Layout() {
	return (
		<AppShell
			brand="voyput"
			nav={SECTIONS.map((section) => (
				<Link
					key={section.to}
					to={section.to}
					activeProps={{ "aria-current": "page" }}
				>
					{section.label}
				</Link>
			))}
		>
			<Outlet />
		</AppShell>
	);
}
