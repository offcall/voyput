import { Card, Notice, PageHeader, PixelArt, Stack } from "@voyput/ui";
import { useState } from "react";
import { SOURCE_URL } from "../app/links";
import { AiCard } from "./AiCard";
import { DataCard } from "./DataCard";
import { ProfileCard } from "./ProfileCard";
import { useSettings } from "./SettingsContext";
import {
	LOCATION_WINDOW_MAX,
	LOCATION_WINDOW_MIN,
	parseLocationWindow,
} from "./settings";
import "./settings.css";

export function SettingsPage() {
	const { settings, persisted, update } = useSettings();
	// The typed window; only a whole number in range is stored.
	const [windowDraft, setWindowDraft] = useState(
		String(settings.locationWindowDays),
	);
	const windowValid = parseLocationWindow(Number(windowDraft)) !== null;
	// Bumped by an import, so cards that read the database once read it again.
	const [imports, setImports] = useState(0);

	return (
		<Stack>
			<PageHeader
				title="Settings"
				art={<PixelArt name="globe" scale={4} />}
				description="Stamps are read by a vision model: through OpenRouter with your own key, or on this computer with your Codex or Claude Code subscription."
			/>
			{persisted ? null : (
				<Notice tone="warn" role="alert">
					This browser refused to save settings. They will be lost when you
					close the tab.
				</Notice>
			)}
			<div className="settings-column">
				<ProfileCard key={imports} />
				<AiCard key={imports} />
				<Card
					title="Review"
					art={<PixelArt name="stamp" scale={3} />}
					description="How stamps are compared with your iPhone photo locations."
				>
					<div className="vp-field">
						<label className="vp-field-label" htmlFor="vp-location-window">
							Photo location window: ± days
						</label>
						<input
							id="vp-location-window"
							className="vp-input settings-number"
							type="number"
							inputMode="numeric"
							min={LOCATION_WINDOW_MIN}
							max={LOCATION_WINDOW_MAX}
							step={1}
							value={windowDraft}
							aria-invalid={!windowValid}
							aria-describedby="vp-location-window-help"
							onChange={(event) => {
								setWindowDraft(event.target.value);
								const days = parseLocationWindow(Number(event.target.value));
								if (days !== null) update({ locationWindowDays: days });
							}}
						/>
						{windowValid ? null : (
							<span className="vp-field-description" role="alert">
								Enter a whole number from {LOCATION_WINDOW_MIN} to{" "}
								{LOCATION_WINDOW_MAX}. Review keeps using ±
								{settings.locationWindowDays} days.
							</span>
						)}
						<span className="vp-field-description" id="vp-location-window-help">
							The Photo location history on a stamp shows this many days before
							and after the stamp date, and a photo in another country this
							close to the stamp date is flagged.
						</span>
					</div>
				</Card>
				<div id="your-data" className="settings-anchor">
					<DataCard
						onImported={(imported) => {
							setImports((n) => n + 1);
							setWindowDraft(String(imported.locationWindowDays));
						}}
					/>
				</div>
			</div>
			<p className="settings-source">
				voyput is open source:{" "}
				<a href={SOURCE_URL} target="_blank" rel="noreferrer">
					github.com/offcall/voyput
				</a>
			</p>
		</Stack>
	);
}
