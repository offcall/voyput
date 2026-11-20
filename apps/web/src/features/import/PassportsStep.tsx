import { Link } from "@tanstack/react-router";
import { Notice } from "@voyput/ui";
import { aiSetupNeeded } from "../../ai/client";
import { useSettings } from "../../settings/SettingsContext";
import { DemoBanner } from "../demo/DemoBanner";
import { PhotoImport } from "./photos/PhotoImport";
import "./import.css";

/**
 * Collect step 1: passports with their page photos, under a thin demo banner.
 * Without a connected AI, a callout says what comes next so uploads do not
 * look like they did nothing.
 */
export function PassportsStep() {
	const { settings } = useSettings();
	const setup = aiSetupNeeded(settings);
	return (
		<div className="import-photos">
			<DemoBanner />
			{setup ? (
				<div className="import-ai-setup">
					<Notice tone="warn">
						<span>
							Next: connect an AI to read the stamps. Your photos are saved.
						</span>
						<Link to="/settings" className="vp-button" data-variant="primary">
							{setup.action}
						</Link>
					</Notice>
				</div>
			) : null}
			<PhotoImport />
		</div>
	);
}
