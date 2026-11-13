import { PageHeader, Stack } from "@voyput/ui";
import { useState } from "react";
import { DemoLoader } from "../demo/DemoLoader";
import { CsvImport, type DemoLoaded } from "./csv/CsvImport";
import { PhotoImport } from "./photos/PhotoImport";
import "./import.css";

export function ImportPage() {
	const [demoLoaded, setDemoLoaded] = useState<DemoLoaded | null>(null);
	return (
		<Stack>
			<PageHeader
				eyebrow="Step 1 of 5"
				title="Import"
				description="Bring your passport photos and the location CSV. Everything stays in this browser."
			/>
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
