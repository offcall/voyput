import { act, render, waitFor } from "@testing-library/react";
import { buildDayRuns, buildPhotoIndex, type LocationRow } from "@voyput/core";
import { describe, expect, it, vi } from "vitest";
import {
	Locations,
	LocationsProvider,
	useLocations,
} from "../src/data/locations";
import { buildPhotoDays } from "../src/data/photoDays";
import { DbProvider } from "../src/db/DbContext";
import { VoyputDb } from "../src/db/db";
import {
	summarizeStoredLocations,
	useStoredLocations,
} from "../src/features/import/csv/storedLocations";

let n = 0;

const row = (
	uuid: string,
	date: string,
	countryCode: string,
	city = "",
): LocationRow => ({
	date,
	lat: 0,
	lon: 0,
	countryCode,
	country: "",
	city,
	source: "test",
	isVideo: false,
	filename: `${uuid}.jpg`,
	uuid,
});

const ROWS = [
	row("u3", "2024-03-03T09:00:00+02:00", "RO", "Iasi"),
	row("u1", "2024-03-01T10:00:00+02:00", "MD", "Chisinau"),
	row("u2", "2024-03-01T18:00:00+02:00", "RO", "Iasi"),
];

describe("Locations", () => {
	it("builds each view as core does, once per read", () => {
		const locations = new Locations(ROWS);
		expect(locations.rows).toBe(ROWS);
		expect(locations.photoIndex).toEqual(buildPhotoIndex(ROWS));
		expect(locations.photoIndex).toBe(locations.photoIndex);
		expect(locations.dayRuns).toEqual(buildDayRuns(buildPhotoIndex(ROWS)));
		expect(locations.dayRuns).toBe(locations.dayRuns);
		expect(locations.photoDays).toEqual(buildPhotoDays(ROWS));
		expect(locations.photoDays).toBe(locations.photoDays);
	});
});

describe("LocationsProvider", () => {
	it("reads the table once for all consumers and again after a change", async () => {
		const db = new VoyputDb(`data-locations-${++n}`);
		await db.locations.bulkPut(ROWS);
		const read = vi.spyOn(db.locations, "toArray");
		const seen: (Locations | undefined)[][] = [[], [], []];
		const Consumer = ({ slot }: { slot: number }) => {
			seen[slot]?.push(useLocations().data);
			return null;
		};
		render(
			<DbProvider db={db}>
				<LocationsProvider>
					<Consumer slot={0} />
					<Consumer slot={1} />
					<Consumer slot={2} />
				</LocationsProvider>
			</DbProvider>,
		);
		await waitFor(() => expect(seen[0]?.at(-1)).toBeDefined());
		const first = seen[0]?.at(-1);
		expect(first?.rows).toHaveLength(3);
		expect(seen[1]?.at(-1)).toBe(first);
		expect(seen[2]?.at(-1)).toBe(first);
		expect(read).toHaveBeenCalledTimes(1);

		await act(() => db.locations.put(row("u4", "2024-03-04", "UA")));
		await waitFor(() => expect(seen[0]?.at(-1)?.rows).toHaveLength(4));
		expect(seen[0]?.at(-1)).not.toBe(first);
		expect(seen[1]?.at(-1)).toBe(seen[0]?.at(-1));
		expect(read).toHaveBeenCalledTimes(2);
	});

	it("gives the CSV card the same summary as reading the table", async () => {
		const db = new VoyputDb(`data-locations-${++n}`);
		await db.locations.bulkPut(ROWS);
		let summary: ReturnType<typeof useStoredLocations>["data"];
		const Card = () => {
			summary = useStoredLocations().data;
			return null;
		};
		render(
			<DbProvider db={db}>
				<LocationsProvider>
					<Card />
				</LocationsProvider>
			</DbProvider>,
		);
		await waitFor(() => expect(summary).toBeDefined());
		expect(summary).toEqual(await summarizeStoredLocations(db));
	});
});
