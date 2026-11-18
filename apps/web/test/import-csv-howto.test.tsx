import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { scriptSha256 } from "../src/app/servedScripts";
import {
	exportCommand,
	HowToGetFile,
} from "../src/features/import/csv/CsvImport";

describe("how to get the photo locations file", () => {
	it("gives the one-line export served by the site, checked before it runs", () => {
		const origin = "https://voyput.example";
		const { container } = render(<HowToGetFile origin={origin} />);

		expect(exportCommand(origin)).toBe(
			`curl -fsSLo photo-locations.sh https://voyput.example/photo-locations.sh && echo "${scriptSha256("photo-locations.sh")}  photo-locations.sh" | shasum -a 256 -c - && sh photo-locations.sh`,
		);
		// Two spaces in the checksum line: match the text as it is.
		expect(
			screen.getByText(exportCommand(origin), { normalizer: (text) => text }),
		).toBeTruthy();
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
