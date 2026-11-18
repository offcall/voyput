import { readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Vitest runs from the repository root. */
const SRC = resolve("apps/web/src");
const FEATURES = join(SRC, "features");

/** Shared code outside `features/` that any section may import (ADR 0038). */
const SHARED = [
	"data/",
	"db/",
	"ai/",
	"settings/SettingsContext",
	"app/countryColours",
	"app/servedScripts",
	"app/useMediaQuery",
];

/** Packages a section may import besides third-party ones. */
const PACKAGES = ["@voyput/core", "@voyput/ui"];

const PAGES =
	"the Collect wizard shows each section's page as one of its steps";
const DEMO_LOADED =
	"carries a demo load to the Locations step; its type is in csv/CsvImport.tsx";
const SHARED_UI = "shared by Extract and Review (TODO.md: Design)";

/**
 * Imports of another section that are still allowed, as `from -> to` (paths
 * under `src/`, without extension), with the reason. A fix removes its line.
 */
const EXCEPTIONS: Readonly<Record<string, string>> = {
	"features/collect/steps -> features/extract/ExtractPage": PAGES,
	"features/collect/steps -> features/import/LocationsStep": PAGES,
	"features/collect/steps -> features/import/PassportsStep": PAGES,
	"features/collect/steps -> features/review/ReviewPage": PAGES,
	"features/collect/steps -> features/trips/TripsPage": PAGES,
	"features/collect/CollectBar -> features/demo/DemoActions":
		"Collect offers the demo's load and remove actions",
	"features/collect/CollectPage -> features/demo/DemoActions":
		"Collect offers the demo's load and remove actions",
	"features/home/HomePage -> features/demo/DemoActions":
		"Home offers the demo's load action",
	"features/collect/CollectPage -> features/import/demoLoaded": DEMO_LOADED,
	"features/home/HomePage -> features/import/demoLoaded": DEMO_LOADED,
	"features/demo/DemoActions -> features/import/demoLoaded": DEMO_LOADED,
	"features/demo/DemoActions -> features/import/csv/locationLine":
		"the demo reports its locations in the CSV card's words",
	"features/demo/DemoBanner -> features/import/csv/locationLine":
		"the demo reports its locations in the CSV card's words",
	"features/import/PassportsStep -> features/demo/DemoBanner":
		"the demo card sits on the Passports step",
	"features/extract/ExtractPage -> features/review/Thumb": SHARED_UI,
	"features/review/PhotoReview -> features/extract/failure": SHARED_UI,
	"features/home/HomePage -> features/collect/SourcesChoice":
		"Home asks the Collect wizard's first question",
	"features/home/HomePage -> features/collect/collect":
		"Home's first question and step links use the Collect wizard's styles",
	"features/home/HomePage -> features/collect/steps":
		"Home links to the Collect wizard's steps",
	"features/home/HomePage -> features/trips/format":
		"word helper `plural`; moves with the trips-to-stays rename",
	"features/home/deleteEverything -> features/extract/runs":
		"Delete everything stops running extractions first",
	"features/visualize/data/useStays -> features/trips/tripStore":
		"Insights shows the Stays step's history; the stays store is not in data/ yet",
};

const STATEMENT =
	/(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[^;]*?from\s+["']([^"']+)["']/g;
const SIDE_EFFECT = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;
const DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']/g;

/** Module specifiers in one source text. */
function specifiers(source: string): string[] {
	return [STATEMENT, SIDE_EFFECT, DYNAMIC].flatMap((pattern) =>
		[...source.matchAll(pattern)].flatMap(([, specifier]) =>
			specifier ? [specifier] : [],
		),
	);
}

const withoutExtension = (path: string) =>
	path.replace(/\?.*$/, "").replace(/\.(tsx?|css|json|geojson)$/, "");

/**
 * Why an import from `file` (a path under `src/`) breaks the boundary, or
 * null when it may stay.
 */
function violation(file: string, specifier: string): string | null {
	const from = withoutExtension(file);
	const section = from.split("/")[1];
	if (!specifier.startsWith(".")) {
		if (specifier.startsWith("@voyput/") && !PACKAGES.includes(specifier))
			return `${from} -> ${specifier}`;
		return null;
	}
	const to = withoutExtension(
		posix.normalize(posix.join(posix.dirname(file), specifier)),
	);
	if (to.startsWith(`features/${section}/`)) return null;
	if (to.startsWith("features/")) {
		const edge = `${from} -> ${to}`;
		return edge in EXCEPTIONS ? null : edge;
	}
	if (SHARED.some((shared) => to === shared || to.startsWith(shared)))
		return null;
	return `${from} -> ${to}`;
}

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return /\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

/** Every import edge of every section file, as `from -> to` and its verdict. */
function edges() {
	return sourceFiles(FEATURES).flatMap((path) => {
		const file = relative(SRC, path).split("\\").join("/");
		return specifiers(readFileSync(path, "utf8")).map((specifier) => ({
			file,
			specifier,
			violation: violation(file, specifier),
		}));
	});
}

describe("section boundaries (ADR 0038)", () => {
	it("tells shared code, own files and other sections apart", () => {
		const file = "features/home/HomePage.tsx";
		expect(violation(file, "./home.css")).toBeNull();
		expect(violation(file, "../../data/plan/usePlan")).toBeNull();
		expect(violation(file, "../../db/DbContext")).toBeNull();
		expect(violation(file, "@voyput/ui")).toBeNull();
		expect(violation(file, "react")).toBeNull();
		expect(violation(file, "../collect/steps")).toBeNull();
		expect(violation(file, "../review/queue")).toBe(
			"features/home/HomePage -> features/review/queue",
		);
		expect(violation(file, "../../app/router")).toBe(
			"features/home/HomePage -> app/router",
		);
		expect(violation(file, "@voyput/local")).toBe(
			"features/home/HomePage -> @voyput/local",
		);
		expect(
			specifiers(
				[
					'import { a } from "../a";',
					'import type { B } from "../b";',
					'export { c } from "../c";',
					'import "./d.css";',
					'const e = await import("../e");',
				].join("\n"),
			),
		).toEqual(["../a", "../b", "../c", "./d.css", "../e"]);
	});

	it("keeps each section to its own folder and the shared code", () => {
		const found = edges().flatMap((edge) =>
			edge.violation ? [edge.violation] : [],
		);
		expect(found).toEqual([]);
	});

	it("lists only exceptions that are still needed", () => {
		const used = new Set(
			edges().map(
				(edge) =>
					`${withoutExtension(edge.file)} -> ${withoutExtension(
						posix.normalize(
							posix.join(posix.dirname(edge.file), edge.specifier),
						),
					)}`,
			),
		);
		expect(Object.keys(EXCEPTIONS).filter((edge) => !used.has(edge))).toEqual(
			[],
		);
	});
});
