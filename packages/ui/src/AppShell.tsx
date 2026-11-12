import type { ReactNode } from "react";

/** Page frame: brand, a nav slot (router links are the app's business) and content. */
export function AppShell({
	brand,
	nav,
	children,
}: {
	brand: ReactNode;
	nav: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="vp-shell">
			<header className="vp-shell-header">
				<div className="vp-shell-brand">{brand}</div>
				<nav className="vp-shell-nav" aria-label="Sections">
					{nav}
				</nav>
			</header>
			<main className="vp-shell-main">{children}</main>
		</div>
	);
}

export function Stack({ children }: { children: ReactNode }) {
	return <div className="vp-stack">{children}</div>;
}
