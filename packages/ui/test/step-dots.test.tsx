import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepDots } from "../src/StepDots";

describe("StepDots", () => {
	it("marks done and current steps and names the position", () => {
		const { getByRole, container } = render(<StepDots count={4} current={1} />);
		expect(getByRole("img", { name: "Step 2 of 4" })).toBeTruthy();
		const states = [...container.querySelectorAll(".vp-step-dot")].map((dot) =>
			dot.getAttribute("data-state"),
		);
		expect(states).toEqual(["done", "current", null, null]);
	});
});
