import { PixelArt, PixelSky, Stack } from "@voyput/ui";
import { useState } from "react";
import { DemoLoader } from "../demo/DemoLoader";
import { CsvImport, type DemoLoaded } from "./csv/CsvImport";
import { PhotoImport } from "./photos/PhotoImport";
import { YourPlan } from "./plan/YourPlan";
import "./import.css";

export function ImportPage() {
	const [demoLoaded, setDemoLoaded] = useState<DemoLoaded | null>(null);
	return (
		<Stack>
			<header className="import-banner">
				<PixelSky height={148}>
					<div className="import-banner-content">
						<div>
							<p className="vp-page-eyebrow">Step 1 of 5</p>
							<h1>Import</h1>
						</div>
						<PixelArt name="passport" scale={4} className="import-banner-art" />
					</div>
				</PixelSky>
				<p className="vp-page-description">
					Bring your passport photos and the location CSV. Everything stays in
					this browser.
				</p>
			</header>
			<YourPlan />
			<div className="import-layout">
				<div className="import-photos">
					<PhotoImport />
				</div>
				<div className="import-csv-slot">
					<CsvImport demoLoaded={demoLoaded} />
				</div>
				<div className="import-demo-slot">
					<DemoLoader
						onLoaded={(summary) =>
							setDemoLoaded({ summary: summary.locationSummary })
						}
					/>
				</div>
			</div>
		</Stack>
	);
}
