# ADR 0019: Stays as Source of Truth

## Status

Accepted. Supersedes the trip part of ADR 0014 (Explore stays derived from stored `Trip`s).

## Context

Trips were stored as periods outside a home country, with stops per day and two boundaries. A travel history reads best as a sequence of one-country stays, as an earlier prototype showed it: how many days, where stays overlap, overnight or long crossings, transits such as a Qatar layover. A trip is just the stays between two home stays. Explore built its own stays from trips, so the same history lived in two shapes.

## Decision

- The stored history is a sequence of `TravelStay`s (`packages/core/src/trips/types.ts`): one country, arrival → departure (both days included; a border day belongs to both stays), kind `stay | transit`, per edge a date, a source (`stamp | photos | estimated | manual`) and a method (`walk | car | bus | train | plane | ship | unknown`), stamp and photo ids, and an approved flag. The first arrival may be null ("since birth", read as the birth date when the user gives one); the last departure may be null (still there).
- `suggestStays` (`trips/build.ts`, a port of that prototype's suggestion logic) builds the full sequence from reviewed stamps and photo locations: the passport gives the backbone, photos subdivide it and fill the time after leaving home, and home fills the time between trips. `mergeKept` puts stays the user keeps (approved ones, migrated trips) back into a rebuilt suggestion.
- Hints are computed, not stored (`trips/hints.ts`): overnight travel (one day between departure and next arrival, info), long travel window (two days, warning), gaps, overlaps, reversed or missing dates, stamps no stay in their country covers, stamps outside their passport's validity (errors).
- `Trip` is derived (`trips/history.ts`: `deriveTrips`): a run of stays outside home. Home is the country of most stays unless the user picks one. Explore's `Stay` is a read model built from `TravelStay`s.
- Photos taken in a transit country during the transit do not count as a visit (`withoutTransitRows`); transits stay out of a trip's `visited` countries.
- Dexie version 3 adds a `stays` table and drops `trips`; its upgrade converts stored trips into stays (`legacyTripStays`) so user edits are kept.
- Periods of trips the user deleted before stays (`trips:dismissed` in `kv`) stay home: every suggestion, in the upgrade and on the Trips step, passes through `applyDismissed`.

## Consequences

- Stored stays do not follow later imports on their own; the Trips step rebuilds suggestions around the stays the user approved.
- Trip ids change: a derived trip's id comes from its first stay.
- Every consumer of trips (Collect plan, Visualize filter, Route, Explore) reads the stays.
