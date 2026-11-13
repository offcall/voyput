import {
	advanceElapsed,
	elapsedAt,
	positionAt,
	positionFromLegValue,
	type RoutePosition,
	type RouteTimeline,
	stopPosition,
} from "@voyput/core";
import { useEffect, useRef, useState } from "react";

/** A frame longer than this (a hidden tab, a debugger) counts as this long. */
const MAX_FRAME_MS = 100;

/** Under reduced motion the route advances in ticks this far apart, without animation frames. */
export const REDUCED_TICK_MS = 500;

export interface Playback {
	/** Where the dot is; snapped to the last stop left under reduced motion. */
	position: RoutePosition;
	playing: boolean;
	speed: number;
	play(): void;
	pause(): void;
	/** Back to the first stop and play. */
	restart(): void;
	/** Jump to a slider value in leg units and pause. */
	seek(legValue: number): void;
	/** Jump to a slider value in leg units and keep playing or paused. */
	jump(legValue: number): void;
	setSpeed(speed: number): void;
}

/**
 * Plays a timeline: elapsed 1× time advances with `requestAnimationFrame`
 * scaled by the speed, and stops at the end. A new timeline (other mode or
 * year) goes back to the start, paused. Hiding the page pauses it.
 */
export function usePlayback(
	timeline: RouteTimeline,
	{ reduced, autoplay }: { reduced: boolean; autoplay: boolean },
): Playback {
	const [elapsed, setElapsed] = useState(0);
	const [playing, setPlaying] = useState(autoplay && !reduced);
	const [speed, setSpeed] = useState(1);
	const [owner, setOwner] = useState(timeline);
	if (owner !== timeline) {
		setOwner(timeline);
		setElapsed(0);
		setPlaying(false);
	}

	const elapsedRef = useRef(elapsed);
	elapsedRef.current = elapsed;

	useEffect(() => {
		if (!playing) return;
		const hide = () => {
			if (document.hidden) setPlaying(false);
		};
		document.addEventListener("visibilitychange", hide);
		return () => document.removeEventListener("visibilitychange", hide);
	}, [playing]);

	useEffect(() => {
		if (!playing) return;
		const step = (frameMs: number): boolean => {
			const next = advanceElapsed(timeline, elapsedRef.current, frameMs, speed);
			elapsedRef.current = next;
			setElapsed(next);
			if (next >= timeline.totalMs) {
				setPlaying(false);
				return false;
			}
			return true;
		};
		if (reduced) {
			const id = window.setInterval(() => {
				if (!step(REDUCED_TICK_MS)) window.clearInterval(id);
			}, REDUCED_TICK_MS);
			return () => window.clearInterval(id);
		}
		let raf = 0;
		let last: number | null = null;
		const tick = (now: number) => {
			const frameMs = last === null ? 0 : Math.min(MAX_FRAME_MS, now - last);
			last = now;
			if (step(frameMs)) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, reduced, speed, timeline]);

	const elapsedOf = (value: number) =>
		elapsedAt(timeline, positionFromLegValue(value, timeline.durations.length));
	const exact = positionAt(timeline, elapsed);
	return {
		position: reduced ? stopPosition(exact) : exact,
		playing,
		speed,
		play() {
			if (elapsedRef.current >= timeline.totalMs) setElapsed(0);
			setPlaying(true);
		},
		pause() {
			setPlaying(false);
		},
		restart() {
			setElapsed(0);
			setPlaying(true);
		},
		seek(value) {
			setPlaying(false);
			setElapsed(elapsedOf(value));
		},
		jump(value) {
			const next = elapsedOf(value);
			elapsedRef.current = next;
			setElapsed(next);
		},
		setSpeed,
	};
}
