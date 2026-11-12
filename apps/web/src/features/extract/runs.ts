import { mapConcurrent } from "@voyput/core";
import type { VoyputDb } from "../../db/db";

const CONCURRENCY = 3;

export interface RunState {
	/** Photo ids being read right now or waiting in the queue. */
	active: ReadonlySet<string>;
	/** Progress of the current batch; kept after it ends until the next one. */
	progress: { done: number; total: number } | null;
}

/**
 * Extraction runs of one database. Lives outside React so a run keeps its state
 * when the user leaves the Extract page, and a photo is never read twice at once.
 */
export class ExtractionRuns {
	private state: RunState = { active: new Set(), progress: null };
	private readonly listeners = new Set<() => void>();

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	snapshot = (): RunState => this.state;

	private set(next: Partial<RunState>): void {
		this.state = { ...this.state, ...next };
		for (const listener of this.listeners) listener();
	}

	/** Runs `work` for every photo that is not already active, a few at a time. */
	async start<P extends { id: string }>(
		photos: readonly P[],
		work: (photo: P) => Promise<void>,
	): Promise<void> {
		const fresh = photos.filter((photo) => !this.state.active.has(photo.id));
		if (fresh.length === 0) return;
		const running = this.state.active.size > 0 && this.state.progress;
		this.set({
			active: new Set([...this.state.active, ...fresh.map((p) => p.id)]),
			progress: running
				? { ...running, total: running.total + fresh.length }
				: { done: 0, total: fresh.length },
		});
		await mapConcurrent(fresh, CONCURRENCY, async (photo) => {
			try {
				await work(photo);
			} catch {
				// `work` records its own failures; a throw here must not stop the queue.
			} finally {
				const active = new Set(this.state.active);
				active.delete(photo.id);
				const progress = this.state.progress;
				this.set({
					active,
					progress: progress && { ...progress, done: progress.done + 1 },
				});
			}
		});
	}
}

const runsByDb = new WeakMap<VoyputDb, ExtractionRuns>();

export function runsFor(db: VoyputDb): ExtractionRuns {
	let runs = runsByDb.get(db);
	if (!runs) {
		runs = new ExtractionRuns();
		runsByDb.set(db, runs);
	}
	return runs;
}
