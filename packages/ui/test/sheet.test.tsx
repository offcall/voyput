import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

	it("moves focus in, keeps Tab inside, closes on Escape and returns focus", async () => {
		const user = userEvent.setup();
		render(<Harness />);
		const opener = screen.getByText("Open");
		await user.click(opener);
		const dialog = await screen.findByRole("dialog", { name: "Filter" });
		// Base UI's focus guards hand focus back to the sheet when Tab lands on them.
		const inside = () =>
			expect(dialog.contains(document.activeElement)).toBe(true);
		await waitFor(inside);

		for (let i = 0; i < 6; i++) {
			await user.tab();
			await waitFor(inside);
		}
		for (let i = 0; i < 6; i++) {
			await user.tab({ shift: true });
			await waitFor(inside);
		}

		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(opener));
	});

	it("closes on a tap outside the sheet", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Harness onChange={onChange} />);
		await user.click(screen.getByText("Open"));
		await screen.findByRole("dialog", { name: "Filter" });
		const backdrop = document.querySelector(".vp-sheet-backdrop");
		expect(backdrop).toBeTruthy();
		await user.click(backdrop as Element);
		expect(onChange).toHaveBeenLastCalledWith(false);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});
});
