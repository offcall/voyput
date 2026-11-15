import { useEffect, useState } from "react";

/** Widths that get the phone layout of Insights (one column, bottom sheet). */
export const PHONE_QUERY = "(max-width: 600px)";

/** Whether the viewport is phone-wide; false where `matchMedia` is missing. */
export function usePhone(): boolean {
	const [phone, setPhone] = useState(
		() =>
			typeof window.matchMedia === "function" &&
			matchMedia(PHONE_QUERY).matches,
	);
	useEffect(() => {
		if (typeof window.matchMedia !== "function") return;
		const media = matchMedia(PHONE_QUERY);
		const update = () => setPhone(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);
	return phone;
}
