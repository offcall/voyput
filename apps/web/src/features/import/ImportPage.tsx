import { PageHeader, Stack } from "@voyput/ui";
import { DemoLoader } from "../demo/DemoLoader";
import { CsvImport } from "./csv/CsvImport";
import { PhotoImport } from "./photos/PhotoImport";
import "./import.css";

export function ImportPage() {
	return (
		<Stack>
			<PageHeader
				eyebrow="Step 1 of 5"
				title="Import"
				description="Bring your passport photos and the location CSV. Everything stays in this browser."
			/>
			<PhotoImport />
			<div className="import-row">
				<CsvImport />
				<DemoLoader />
			</div>
		</Stack>
	);
}
