import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	exportCommand,
	HowToGetFile,
} from "../src/features/import/csv/CsvImport";

describe("how to get the photo locations file", () => {
	it("gives the one-line export served by the site", () => {
		const origin = "https://voyput.example";
		const { container } = render(<HowToGetFile origin={origin} />);

		expect(exportCommand(origin)).toBe(
			"curl -fsSL https://voyput.example/photo-locations.sh | sh",
		);
		expect(screen.getByText(exportCommand(origin))).toBeTruthy();
		expect(container.textContent).toContain("Full Disk Access");
		expect(container.textContent).toContain("Columns: date, lat, lon");
		expect(
			container.querySelector<HTMLAnchorElement>("a")?.getAttribute("href"),
		).toBe("https://voyput.example/photo-locations.sh");
	});

	it("opens the how-to when asked, as with nothing imported yet", () => {
		const { container } = render(
			<HowToGetFile origin="https://voyput.example" open />,
		);
		expect(container.querySelector("details")?.open).toBe(true);
	});
});
