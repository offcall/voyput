import { Disclosure } from "@voyput/ui";

/** How to photograph stamp pages so the model can read them. */
export function PhotoGuidance() {
	return (
		<Disclosure summary="How to photograph the pages">
			<ul>
				<li>Lay the passport flat on a table, in good light.</li>
				<li>Fit the whole page in the frame, edges included.</li>
				<li>Avoid glare: tilt the light, not the passport.</li>
				<li>One page per photo.</li>
				<li>Check that every stamp is sharp and its date readable.</li>
				<li>Only stamp and visa pages are needed.</li>
			</ul>
		</Disclosure>
	);
}
