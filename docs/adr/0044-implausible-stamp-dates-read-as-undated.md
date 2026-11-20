# ADR 0044: Implausible Stamp Dates Read as Undated

## Status

Accepted

## Context

A stamp date field that saved after every typed digit, and model output, stored dates such as 0027-10-02. Review's timeline, pairing, stays and Insights all use a stamp's date, so such a year put the timeline at year 27. Stamps are read in many places (Review, Stays, the plan, evidence changes), each straight from `db.stamps`. Stored data is the user's and is not rewritten by a migration.

## Decision

- A stamp date counts for travel only when it is plausible: from 1900-01-01, and, where today is known, up to the end of next year (`isPlausibleDay` in core).
- A Dexie `reading` hook on `db.stamps` passes every stored stamp through core `withPlausibleDate`: an implausible date reads as `null` with the open problem `implausible date <date>` before any other problem. The stored record is not changed by reading.
- Model output with such a year is stored with a `null` date and the same problem line.
- Setting a date on the Review card fixes the problem, like other date problems.

## Consequences

- Every reader, including new ones, gets the same view with one hook; no feature checks years on its own.
- Writes never store the read view: an edit or a hidden warning writes only its changed fields, from the stored record (`readDate` keeps the stored date), and a delete keeps the stored record for Undo. Backups export stored rows (ADR 0048).
- `Collection.raw()` reads skip the hook and see the stored date.
