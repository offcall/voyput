import { Drawer } from "@base-ui/react/drawer";
import type { ReactNode } from "react";

export interface SheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	/** One quiet line under the title. */
	description?: ReactNode;
	children: ReactNode;
	/** Buttons pinned under the scrolling body, e.g. Apply / Cancel. */
	actions?: ReactNode;
}

/**
 * A bottom sheet for phones: slides up from the bottom edge, with a drag handle.
 * Swipe down, Escape, the close button or a tap on the backdrop closes it; focus
 * stays inside while open. The body scrolls inside a sheet at most 85% of the
 * screen tall, and the safe area under it is kept clear. On wide screens it is a
 * centred panel at the bottom. Built on Base UI Drawer (a Dialog with swipe).
 */
export function Sheet({
	open,
	onOpenChange,
	title,
	description,
	children,
	actions,
}: SheetProps) {
	return (
		<Drawer.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
			<Drawer.Portal>
				<Drawer.Backdrop className="vp-sheet-backdrop" />
				<Drawer.Viewport className="vp-sheet-viewport">
					<Drawer.Popup className="vp-sheet-popup">
						<div className="vp-sheet-handle" aria-hidden="true" />
						<div className="vp-sheet-head">
							<div className="vp-sheet-heading">
								<Drawer.Title className="vp-sheet-title">{title}</Drawer.Title>
								{description ? (
									<Drawer.Description className="vp-sheet-description">
										{description}
									</Drawer.Description>
								) : null}
							</div>
							<Drawer.Close
								className="vp-button vp-sheet-close"
								data-variant="ghost"
								data-square=""
								aria-label="Close"
							>
								<span aria-hidden="true">✕</span>
							</Drawer.Close>
						</div>
						<Drawer.Content className="vp-sheet-body">
							{children}
						</Drawer.Content>
						{actions ? <div className="vp-sheet-actions">{actions}</div> : null}
					</Drawer.Popup>
				</Drawer.Viewport>
			</Drawer.Portal>
		</Drawer.Root>
	);
}
