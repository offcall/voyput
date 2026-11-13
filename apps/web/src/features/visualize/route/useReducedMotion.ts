import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** Whether the user asked for less motion; false where `matchMedia` is missing. */
export function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState(
		() => typeof window.matchMedia === "function" && matchMedia(QUERY).matches,
	);
	useEffect(() => {
		if (typeof window.matchMedia !== "function") return;
		const media = matchMedia(QUERY);
		const update = () => setReduced(media.matches);
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);
	return reduced;
}
