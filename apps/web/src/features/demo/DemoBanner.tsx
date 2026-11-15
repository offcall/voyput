import { Button, Disclosure } from "@voyput/ui";
import { locationLine } from "../import/csv/locationLine";
import { type DemoState, useDemoActions } from "./DemoActions";
import { SAMPLE_CREDITS } from "./sampleCredits";
import "./demo.css";

/**
 * One thin line on Passports while demo data is stored (or was just loaded or
 * removed): what happened, Remove, and what the demo is in a disclosure. Loading
 * starts from the Sources choice.
 */
export function DemoBanner() {
	const { hasDemo, state, load, remove } = useDemoActions();
	if (!hasDemo && state.kind === "idle") return null;
	const busy = state.kind === "busy";

	return (
		<section className="demo-banner" aria-label="Demo data">
			<div className="demo-banner-row">
				<StatusLine state={state} hasDemo={hasDemo === true} />
				{hasDemo ? (
					<Button
						size="sm"
						variant="ghost"
						onClick={() => void remove()}
						disabled={busy}
					>
						Remove demo data
					</Button>
				) : null}
			</div>
			{hasDemo ? (
				<Disclosure summary="About the demo">
					<p className="demo-text">
						A fictional passport with stamps already read and reviewed, plus
						matching photo locations. Also 10 real stamp pages from Wikimedia
						Commons, read by Gemini but not reviewed, to try Review on. No API
						key needed.
					</p>
					<p className="demo-note">
						Demo passports and demo photo locations mix with your own data in
						Review, Stays and Insights until you remove them. Remove deletes the
						demo passports, their stamps and the demo photo locations; your own
						data stays.
					</p>
					<div className="demo-actions">
						<Button size="sm" onClick={() => void load()} disabled={busy}>
							Load demo data again
						</Button>
					</div>
					<p className="demo-note">Sample page credits (Wikimedia Commons):</p>
					<ul className="demo-credits">
						{SAMPLE_CREDITS.map((credit) => (
							<li key={credit.files}>
								{credit.files}: <a href={credit.url}>{credit.title}</a> by{" "}
								{credit.author},{" "}
								<a href={credit.licenseUrl}>{credit.license}</a>;{" "}
								{credit.changes}.
							</li>
						))}
					</ul>
				</Disclosure>
			) : null}
		</section>
	);
}

function StatusLine({
	state,
	hasDemo,
}: {
	state: DemoState;
	hasDemo: boolean;
}) {
	switch (state.kind) {
		case "busy":
			return (
				<p className="demo-banner-text" role="status">
					Working on demo data…
				</p>
			);
		case "error":
			return (
				<p className="demo-banner-text" data-tone="bad" role="alert">
					{state.message}
				</p>
			);
		case "removed":
			return (
				<p className="demo-banner-text" role="status">
					Demo data removed.
				</p>
			);
		case "loaded": {
			const { photos, stamps, samples, locationSummary } = state.summary;
			return (
				<p className="demo-banner-text" role="status">
					<strong>Demo data loaded.</strong> {photos} demo pages, {stamps}{" "}
					stamps and {locationLine(locationSummary)}. Plus {samples.pages}{" "}
					sample pages with {samples.stamps} stamps to review.
				</p>
			);
		}
		case "idle":
			return hasDemo ? (
				<p className="demo-banner-text">
					<strong>Demo data loaded.</strong> It mixes with your own data until
					you remove it.
				</p>
			) : null;
	}
}
