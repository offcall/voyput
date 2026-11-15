import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	EXPORT_SCRIPT_URL,
	HowToGetFile,
} from "../src/features/import/csv/CsvImport";

describe("how to get the photo locations file", () => {
	it("explains the export script, which lives in tools/photos-export", () => {
		expect(EXPORT_SCRIPT_URL).toBe(
			"https://github.com/offcall/voyput/tree/main/tools/photos-export",
		);
		const { container } = render(<HowToGetFile scriptUrl={null} />);

		expect(screen.getByText("uv run export_photo_locations.py")).toBeTruthy();
		expect(container.textContent).toContain("Full Disk Access");
		expect(container.textContent).toContain("Columns: date, lat, lon");
		expect(container.querySelector("a")).toBeNull();
	});

	it("links the script once a URL is set", () => {
		const { container } = render(
			<HowToGetFile scriptUrl="https://example.com/export" />,
		);

		expect(
			container.querySelector<HTMLAnchorElement>("a")?.getAttribute("href"),
		).toBe("https://example.com/export");
		expect(container.querySelector("a")?.textContent).toBe("Get the script");
	});
});
