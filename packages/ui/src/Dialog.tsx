import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

export interface DialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	children: ReactNode;
	actions?: ReactNode;
}

export function Dialog({
	open,
	onOpenChange,
	title,
	children,
	actions,
}: DialogProps) {
	return (
		<BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
			<BaseDialog.Portal>
				<BaseDialog.Backdrop className="vp-dialog-backdrop" />
				<BaseDialog.Popup className="vp-dialog-popup">
					<BaseDialog.Title className="vp-dialog-title">
						{title}
					</BaseDialog.Title>
					{children}
					{actions ? <div className="vp-dialog-actions">{actions}</div> : null}
				</BaseDialog.Popup>
			</BaseDialog.Portal>
		</BaseDialog.Root>
	);
}
