import { render, screen, within } from "@testing-library/react";
import { buildPhotoIndex, type Stamp } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { TimelineView } from "../src/features/review/TimelineView";

const stamp = (
	id: string,
	date: string | null,
	countryCode: string,
	direction: Stamp["direction"],
): Stamp => ({
	id,
	passportId: "p",
	photoId: "ph",
	direction,
	borderCrossing: "plane",
	dateText: "",
	date,
	country: countryCode,
	countryCode,
	location: null,
	confidence: null,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: false,
});

const view = (stamps: Stamp[]) =>
	render(
		<TimelineView
			dayRuns={[]}
			travelDays={new Map()}
			index={buildPhotoIndex([])}
			stamps={stamps}
			photoNames={new Map()}
			windowDays={90}
			onWindowDays={() => {}}
			onFrom={() => {}}
			onOpen={() => {}}
		/>,
	);

describe("review timeline view", () => {
	it("shows undated stamps when nothing has a date", () => {
		view([stamp("a", null, "GE", "entry")]);
		const undated = screen.getByRole("region", {
			name: "Stamps without a date",
		});
		expect(within(undated).getAllByRole("button")).toHaveLength(1);
	});

	it("heads each year once and measures gaps from the latest exit", () => {
		const { container } = view([
			stamp("in", "2019-12-28", "GE", "entry"),
			stamp("out", "2020-01-05", "GE", "exit"),
			stamp("tr-in", "2020-01-01", "TR", "entry"),
			stamp("tr-out", "2020-01-02", "TR", "exit"),
			stamp("am-in", "2020-02-01", "AM", "entry"),
		]);
		const years = [...container.querySelectorAll(".review-year")].map(
			(li) => li.textContent,
		);
		expect(years).toEqual(["2019", "2020"]);
		const gaps = [...container.querySelectorAll(".review-gap")].map(
			(li) => li.textContent,
		);
		expect(gaps).toEqual(["27 days later"]);
	});
});
