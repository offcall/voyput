import { describe, expect, it } from "vitest";
import {
	type StayHint,
	stayQueue,
	stayStatuses,
	type TravelStay,
} from "../src/index";

const stay = (id: string, extra: Partial<TravelStay> = {}): TravelStay => ({
	id,
	countryCode: "FR",
	place: "",
	kind: "stay",
	arrival: { date: "2020-01-01", source: "stamp", method: "plane" },
	departure: { date: "2020-01-10", source: "stamp", method: "plane" },
	stampIds: [],
	photoIds: [],
	approved: false,
	...extra,
});

const overlap: StayHint = {
	kind: "overlap",
	severity: "error",
	from: "2020-01-05",
	to: "2020-01-08",
	days: 3,
};
const longWindow: StayHint = {
	kind: "long-window",
	severity: "warning",
	from: "2020-01-10",
	to: "2020-01-20",
};

describe("stayStatuses", () => {
	it("puts changed evidence first, then errors, then approved or clear stays", () => {
		const stays = [
			stay("changed", { approved: true, evidenceChanged: true }),
			stay("error", { approved: true }),
			stay("approved", { approved: true }),
			stay("clear"),
			stay("check"),
			stay("warned"),
		];
		const hints = [[overlap], [overlap], [], [], [], [longWindow]];
		expect(stayStatuses(stays, hints, ["clear"])).toEqual([
			"changed",
			"error",
			"ok",
			"ok",
			"check",
			"check",
		]);
	});

	it("reads a stay without hints as having none", () => {
		expect(stayStatuses([stay("a")], [], [])).toEqual(["check"]);
	});
});

describe("stayQueue", () => {
	it("lists every stay that is not ok, in list order", () => {
		const stays = [stay("a"), stay("b"), stay("c"), stay("d")];
		expect(stayQueue(stays, ["check", "ok", "changed", "error"])).toEqual([
			"a",
			"c",
			"d",
		]);
	});
});
