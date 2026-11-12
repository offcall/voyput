export interface Boundary {
	date: string;
	source: "manual" | "stamp" | "unknown";
	stampId?: string;
	method: string;
}

export interface TripStop {
	id: string;
	day: string;
	countryCode: string;
	country: string;
	cities: string[];
	kind: "stay" | "transit";
}

/** A trip built from stamps and location data, then edited by hand. */
export interface Trip {
	id: string;
	title: string;
	start: string;
	end: string;
	confirmed: boolean;
	arrival: Boundary;
	departure: Boundary;
	stops: TripStop[];
	stampIds: string[];
}
