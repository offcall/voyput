import { DemoBanner } from "../demo/DemoBanner";
import { PhotoImport } from "./photos/PhotoImport";
import "./import.css";

/** Collect step 1: passports with their page photos, under a thin demo banner. */
export function PassportsStep() {
	return (
		<div className="import-photos">
			<DemoBanner />
			<PhotoImport />
		</div>
	);
}
