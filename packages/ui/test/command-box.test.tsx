import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandBox } from "../src/CommandBox";

describe("CommandBox", () => {
	it("shows the command and copies it with the button", async () => {
		const writeText = vi.fn(() => Promise.resolve());
		Object.assign(navigator, { clipboard: { writeText } });
		render(<CommandBox command="echo hi" label="Copy the test command" />);

		expect(screen.getByText("echo hi").tagName).toBe("CODE");
		fireEvent.click(
			screen.getByRole("button", { name: "Copy the test command" }),
		);

		expect(writeText).toHaveBeenCalledWith("echo hi");
		expect(await screen.findByText("Copied")).toBeTruthy();
	});
});
