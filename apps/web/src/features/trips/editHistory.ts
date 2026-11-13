import type { TravelStay } from "@voyput/core";

/** What one edit changes and Undo brings back. */
export interface Snapshot {
	stays: TravelStay[];
	birth: string | null;
}

export interface EditState extends Snapshot {
	past: Snapshot[];
	future: Snapshot[];
	/** Counts edits, undos and redos, not loads: what changed must be saved. */
	version: number;
}

export type EditAction =
	| { type: "load"; snapshot: Snapshot }
	| { type: "edit"; snapshot: Snapshot }
	| { type: "undo" }
	| { type: "redo" };

/** Undo steps kept. */
const LIMIT = 50;

export const EMPTY_EDITS: EditState = {
	stays: [],
	birth: null,
	past: [],
	future: [],
	version: 0,
};

export function editReducer(state: EditState, action: EditAction): EditState {
	const current: Snapshot = { stays: state.stays, birth: state.birth };
	switch (action.type) {
		case "load":
			return {
				...action.snapshot,
				past: [],
				future: [],
				version: state.version,
			};
		case "edit":
			return {
				...action.snapshot,
				past: [...state.past, current].slice(-LIMIT),
				future: [],
				version: state.version + 1,
			};
		case "undo": {
			const previous = state.past.at(-1);
			if (!previous) return state;
			return {
				...previous,
				past: state.past.slice(0, -1),
				future: [...state.future, current],
				version: state.version + 1,
			};
		}
		case "redo": {
			const next = state.future.at(-1);
			if (!next) return state;
			return {
				...next,
				past: [...state.past, current],
				future: state.future.slice(0, -1),
				version: state.version + 1,
			};
		}
	}
}
