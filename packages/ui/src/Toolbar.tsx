import type { ReactNode } from "react";

/** A row of controls that wraps on narrow screens; put a ToolbarSpacer between left and right groups. */
export function Toolbar({ children }: { children: ReactNode }) {
	return <div className="vp-toolbar">{children}</div>;
}

export function ToolbarSpacer() {
	return <span className="vp-toolbar-spacer" />;
}
