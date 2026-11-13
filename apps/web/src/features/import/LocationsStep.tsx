import { CsvImport } from "./csv/CsvImport";
import { useDemoLoaded } from "./demoLoaded";
import "./import.css";

/** Collect step 2: the iPhone photo locations CSV and what is stored. */
export function LocationsStep() {
	const { demoLoaded } = useDemoLoaded();
	return (
		<div className="import-locations">
			<CsvImport demoLoaded={demoLoaded} />
		</div>
	);
}
