import { Button } from "@voyput/ui";
import { useEffect } from "react";

/** What the toast says after a change, an undo or a redo, and what its button does. */
export interface ToastMessage {
	/** Changes on every message, so the timer starts again. */
	id: number;
	text: string;
	action: "undo" | "redo";
}

/** How long a toast stays. */
const TOAST_MS = 8000;

/** "Approved 7 stays · Undo": a short note after a change, with a way back. */
export function UndoToast({
	message,
	onAction,
	onClose,
}: {
	message: ToastMessage;
	onAction: (action: "undo" | "redo") => void;
	onClose: () => void;
}) {
	useEffect(() => {
		const timer = setTimeout(onClose, TOAST_MS);
		return () => clearTimeout(timer);
	}, [onClose]);
	return (
		<div className="vp-stays-toast" role="status">
			<span>{message.text}</span>
			<Button size="sm" onClick={() => onAction(message.action)}>
				{message.action === "undo" ? "Undo" : "Redo"}
			</Button>
		</div>
	);
}
