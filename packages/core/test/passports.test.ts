import { describe, expect, it } from "vitest";
import { isIsoDate, photoMimeType, rotateBy } from "../src/passports/photos";

describe("passport photos", () => {
	it("accepts only JPEG and PNG, falling back to the extension when the type is empty", () => {
		expect(photoMimeType({ name: "a.jpg", type: "image/jpeg" })).toBe(
			"image/jpeg",
		);
		expect(photoMimeType({ name: "b.PNG", type: "" })).toBe("image/png");
		expect(photoMimeType({ name: "c.heic", type: "image/heic" })).toBeNull();
		expect(
			photoMimeType({ name: "d.jpg", type: "application/pdf" }),
		).toBeNull();
		expect(photoMimeType({ name: "e.webp", type: "" })).toBeNull();
	});

	it("wraps rotation in both directions", () => {
		expect(rotateBy(270, 90)).toBe(0);
		expect(rotateBy(0, -90)).toBe(270);
		expect(() => rotateBy(0, 45)).toThrow();
	});

	it("rejects impossible dates", () => {
		expect(isIsoDate("2016-02-29")).toBe(true);
		expect(isIsoDate("2017-02-29")).toBe(false);
		expect(isIsoDate("29.02.2016")).toBe(false);
	});
});
