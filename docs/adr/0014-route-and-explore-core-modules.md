# ADR 0014: Route and Explore Core Modules

## Status

Accepted

## Context

The Visualize section gains two tabs ported from the earlier `trip-explore` prototype: a world-map route player and a filterable dashboard of stays. The prototype read a JSON export; voyput keeps its data in Dexie (locations, stamps, trips). Its pure logic (curve and duration maths, photo clustering, stay filtering and aggregation) needs a home that ADR 0004 allows: `packages/core`, one folder per domain.

## Decision

- `packages/core/src/route/`: the route player's maths. Leg distance, easing, the arc control point and quadratic Bézier point the map draws, the duration water-fill (whole route ≈ 2 min, border legs capped at 1 s), chronological proximity clustering of `LocationRow`s into waypoints, and the waypoints of the "by countries" mode built from stays. Reuses `haversineKm` and the projection from `viz`.
- `packages/core/src/explore/`: the stay model and its aggregates. A `Stay` is a run of consecutive days in one country, derived from `Trip`s (stops grouped by country, edges from the trip's arrival and departure boundaries) plus home stays between trips. Filters, clipping to a date range, country and year groups, consecutive-stay routes, records, and a region map for every country code.
- Both export through `packages/core/src/index.ts`. No React, IndexedDB or network, per ADR 0004.

## Consequences

- The prototype's tests move with the logic and run in the default `npm test`.
- Stays are derived on read, never stored: no Dexie schema change. Editing a trip changes Explore on the next open.
- The prototype's JSON import and its "birth" stay are not ported.
