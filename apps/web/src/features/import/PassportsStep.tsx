import { DemoLoader } from "../demo/DemoLoader";
import { useDemoLoaded } from "./demoLoaded";
import { PhotoImport } from "./photos/PhotoImport";
import "./import.css";

/** Collect step 1: passports with their page photos, and the demo loader beside them. */
export function PassportsStep() {
	const { setDemoLoaded } = useDemoLoaded();
	return (
		<div className="import-layout">
			<div className="import-photos">
				<PhotoImport />
			</div>
			<div className="import-demo-slot">
				<DemoLoader
					onLoaded={(summary) =>
						setDemoLoaded({ summary: summary.locationSummary })
					}
					onRemoved={() => setDemoLoaded(null)}
				/>
			</div>
		</div>
	);
}
