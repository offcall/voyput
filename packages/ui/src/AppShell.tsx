import type { ReactNode } from "react";

/**
 * Page frame: a sidebar with brand, a nav slot (router links are the app's business)
 * and an optional footer; it turns into a top bar on narrow screens.
 * Style nav links with `vp-nav-icon`, `vp-nav-label` and `vp-nav-count` spans.
 */
export function AppShell({
	brand,
	nav,
	footer,
	children,
}: {
	brand: ReactNode;
	nav: ReactNode;
	footer?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="vp-shell">
			<aside className="vp-shell-side">
				<header className="vp-shell-header">
					<div className="vp-shell-brand">{brand}</div>
					<nav className="vp-shell-nav" aria-label="Sections">
						{nav}
					</nav>
					{footer ? <div className="vp-shell-footer">{footer}</div> : null}
				</header>
			</aside>
			<main className="vp-shell-main">{children}</main>
		</div>
	);
}

export function Stack({ children }: { children: ReactNode }) {
	return <div className="vp-stack">{children}</div>;
}
