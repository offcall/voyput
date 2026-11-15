import { Button } from "@voyput/ui";
import { useEffect } from "react";

/** What the toast says after a change, an undo or a redo, and what its button does. */
export interface ToastMessage {
	/** Changes on every message: the timer starts again. */
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
	// Stays mounted across messages, so a click on Undo is never lost to a
	// change that lands first (a field saving on blur); each message restarts the timer.
	const { id } = message;
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new message restarts the timer
	useEffect(() => {
		const timer = setTimeout(onClose, TOAST_MS);
		return () => clearTimeout(timer);
	}, [id, onClose]);
	return (
		<div className="vp-stays-toast" role="status">
			<span>{message.text}</span>
			<Button size="sm" onClick={() => onAction(message.action)}>
				{message.action === "undo" ? "Undo" : "Redo"}
			</Button>
		</div>
	);
}
