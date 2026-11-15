import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "../src/Sheet";

function Harness({ onChange }: { onChange?: (open: boolean) => void }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				Open
			</button>
			<Sheet
				open={open}
				onOpenChange={(next) => {
					onChange?.(next);
					setOpen(next);
				}}
				title="Filter"
				description="Pick countries"
				actions={<button type="button">Apply</button>}
			>
				<input aria-label="Search" />
			</Sheet>
		</>
	);
}

describe("Sheet", () => {
	it("opens as a labelled dialog with its body and actions", async () => {
		render(<Harness />);
		expect(screen.queryByRole("dialog")).toBeNull();
		await act(async () => fireEvent.click(screen.getByText("Open")));
		const dialog = await screen.findByRole("dialog", { name: "Filter" });
		expect(dialog.textContent).toContain("Pick countries");
		expect(screen.getByLabelText("Search")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();
	});

	it("closes with the close button and with Escape", async () => {
		const onChange = vi.fn();
		render(<Harness onChange={onChange} />);
		await act(async () => fireEvent.click(screen.getByText("Open")));
		await act(async () =>
			fireEvent.click(await screen.findByRole("button", { name: "Close" })),
		);
		expect(onChange).toHaveBeenLastCalledWith(false);

		await act(async () => fireEvent.click(screen.getByText("Open")));
		const dialog = await screen.findByRole("dialog", { name: "Filter" });
		await act(async () => fireEvent.keyDown(dialog, { key: "Escape" }));
		expect(onChange).toHaveBeenLastCalledWith(false);
		expect(onChange).toHaveBeenCalledTimes(2);
	});
});
