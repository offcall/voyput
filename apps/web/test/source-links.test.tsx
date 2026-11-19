import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SOURCE_URL } from "../src/app/links";
import { renderApp } from "./renderApp";

describe("links to the source", () => {
	it("the sidebar and Settings link the public repository", async () => {
		renderApp("/settings");

		const sidebar = await screen.findByRole("link", {
			name: "Source on GitHub",
		});
		expect(sidebar.getAttribute("href")).toBe(SOURCE_URL);
		expect(
			screen
				.getByRole("link", { name: "github.com/offcall/voyput" })
				.getAttribute("href"),
		).toBe(SOURCE_URL);
		expect(SOURCE_URL).toBe("https://github.com/offcall/voyput");
	});
});
