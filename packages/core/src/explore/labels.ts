import type { EdgeSource } from "../trips/types";
import type { DurationFilter, EvidenceFilter, KindFilter } from "./types";

/** Entry methods (`TravelMethod`), for the method filter. */
export const METHOD_LABELS: Readonly<Record<string, string>> = {
	plane: "Plane",
	car: "Car",
	bus: "Bus",
	train: "Train",
	ship: "Ship",
	walk: "On foot",
	unknown: "Unknown",
};

export const SOURCE_LABELS: Readonly<Record<EdgeSource, string>> = {
	stamp: "Stamp",
	manual: "Set by hand",
	photos: "From photos",
	estimated: "Estimated",
};

export const KIND_LABELS: Readonly<Record<KindFilter, string>> = {
	all: "Stays and transits",
	stay: "Stay",
	transit: "Transit",
};

export const EVIDENCE_LABELS: Readonly<Record<EvidenceFilter, string>> = {
	all: "Any evidence",
	exact: "Exact dates (stamps or set by hand)",
	estimated: "Estimated dates",
	stamps: "At least one stamp",
};

export const DURATION_LABELS: Readonly<Record<DurationFilter, string>> = {
	all: "Any length",
	day: "One day",
	short: "2–7 days",
	medium: "8–30 days",
	long: "31+ days",
};

export const methodLabel = (method: string): string =>
	METHOD_LABELS[method] ?? method;
