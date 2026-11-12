import { Stack } from "@voyput/ui";
import { DemoLoader } from "../demo/DemoLoader";
import { CsvImport } from "./csv/CsvImport";
import { PhotoImport } from "./photos/PhotoImport";

export function ImportPage() {
	return (
		<Stack>
			<h1>Import</h1>
			<p>Bring your passport photos and the location CSV.</p>
			<PhotoImport />
			<CsvImport />
			<DemoLoader />
		</Stack>
	);
}
