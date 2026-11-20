import { describe, expect, it } from "vitest";
import {
	parseBox,
	parsePhotoResponse,
	type StampBox,
	unrotateBox,
} from "../src/index";

const NO_RANGE = { from: null, to: null };

/** The box's corners rounded, so float noise does not fail a test. */
const round = (box: StampBox | undefined) =>
	box && {
		x: Number(box.x.toFixed(6)),
		y: Number(box.y.toFixed(6)),
		width: Number(box.width.toFixed(6)),
		height: Number(box.height.toFixed(6)),
	};

describe("parseBox", () => {
	it("reads [x, y, width, height]", () => {
		expect(parseBox([0.1, 0.2, 0.3, 0.4])).toEqual({
			x: 0.1,
			y: 0.2,
			width: 0.3,
			height: 0.4,
		});
	});

	it("clamps a box that sticks out of the image", () => {
		expect(round(parseBox([-0.1, 0.8, 0.3, 0.5]))).toEqual({
			x: 0,
			y: 0.8,
			width: 0.2,
			height: 0.2,
		});
	});

	it("drops anything that is not a box with an area", () => {
		for (const bad of [
			undefined,
			null,
			"0.1,0.2,0.3,0.4",
			[0.1, 0.2, 0.3],
			[0.1, 0.2, 0.3, "0.4"],
			[0.1, 0.2, Number.NaN, 0.4],
			[0.1, 0.2, 0, 0.4],
			[0.1, 0.2, 0.3, -0.4],
			[120, 80, 300, 200],
			{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
		])
			expect(parseBox(bad)).toBeUndefined();
	});

	it("keeps a stamp whose box is bad, without the box or a warning", () => {
		const { stamps } = parsePhotoResponse(
			JSON.stringify({
				stamps: [
					{
						direction: "entry",
						date: "2021-10-25",
						dateText: "25.10.21",
						box: [0.1, 0.1, 0.2, 0.2],
					},
					{
						direction: "entry",
						date: "2021-10-25",
						dateText: "25.10.21",
						box: "top left",
					},
				],
			}),
			NO_RANGE,
		);
		expect(stamps[0]?.box).toEqual({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
		expect(stamps[1]).not.toHaveProperty("box");
		expect(stamps[1]?.problem).toBeNull();
	});
});

describe("unrotateBox", () => {
	// A box in the top-left corner of the photo the model saw.
	const seen: StampBox = { x: 0.1, y: 0.2, width: 0.3, height: 0.1 };

	it("keeps the box of an unturned photo", () => {
		expect(unrotateBox(seen, 0)).toEqual(seen);
	});

	it("turns the box back for each rotation", () => {
		// Turned 90° clockwise, the photo's left edge became the top.
		expect(round(unrotateBox(seen, 90))).toEqual({
			x: 0.2,
			y: 0.6,
			width: 0.1,
			height: 0.3,
		});
		expect(round(unrotateBox(seen, 180))).toEqual({
			x: 0.6,
			y: 0.7,
			width: 0.3,
			height: 0.1,
		});
		expect(round(unrotateBox(seen, 270))).toEqual({
			x: 0.7,
			y: 0.1,
			width: 0.1,
			height: 0.3,
		});
	});
});
