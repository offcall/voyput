import { useCallback, useEffect, useState } from "react";

/**
 * Bumps whenever the theme can have changed: the `data-theme` attribute on
 * `<html>` or the system colour scheme.
 */
function useThemeVersion(): number {
	const [version, setVersion] = useState(0);
	useEffect(() => {
		const bump = () => setVersion((n) => n + 1);
		const observer = new MutationObserver(bump);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});
		const media =
			typeof window.matchMedia === "function"
				? window.matchMedia("(prefers-color-scheme: dark)")
				: null;
		media?.addEventListener("change", bump);
		return () => {
			observer.disconnect();
			media?.removeEventListener("change", bump);
		};
	}, []);
	return version;
}

/** Resolves any CSS colour to a concrete one; caches per colour. */
export type Painter = (css: string) => string;

/**
 * Canvas cannot read `var(--vp-…)` and tokens are `light-dark()` values
 * (ADR 0012), so each colour is set on a hidden probe inside `host` and read
 * back as computed `rgb(…)`. Make a new painter after a theme change.
 */
export function makePainter(host: Element): Painter {
	const cache = new Map<string, string>();
	return (css) => {
		let resolved = cache.get(css);
		if (resolved !== undefined) return resolved;
		const probe = document.createElement("span");
		probe.style.display = "none";
		probe.style.color = css;
		host.append(probe);
		resolved = getComputedStyle(probe).color || css;
		probe.remove();
		cache.set(css, resolved);
		return resolved;
	};
}

/**
 * `makePainter` that changes identity with the theme: put it in a canvas
 * effect's dependencies so the chart redraws in the new colours.
 */
export function usePainter(): (host: Element) => Painter {
	const version = useThemeVersion();
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new factory per theme version is the point.
	return useCallback((host: Element) => makePainter(host), [version]);
}

/** `rgb(r, g, b)` / `rgba(…)` with a new alpha; other strings unchanged. */
export function fade(rgb: string, alpha: number): string {
	const match = /^rgba?\(([^,]+),([^,]+),([^,)]+)/.exec(rgb.replace(/\s/g, ""));
	if (!match) return rgb;
	return `rgba(${match[1]},${match[2]},${match[3]},${alpha})`;
}
