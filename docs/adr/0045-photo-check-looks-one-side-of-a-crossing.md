# ADR 0045: Photo Check Looks One Side of a Crossing

## Status

Accepted. Amends ADR 0030: which photos in another country make `checkStamp` warn. Its suggestion search amended by ADR 0046 (a misread year).

## Context

ADR 0030 warns with the nearest photo in another country within the window, on either side of the stamp date. On a normal transit that photo is expected: after an exit the traveller is in the next country, before an entry in the previous one. Testers saw many "N day(s) from the stamp date" warnings on stamps that were right.

## Decision

- An exit is contradicted only by photos in another country on or before its date; an entry only by those on or after it. An unknown direction keeps both sides.
- The confirming days (ADR 0030), the window (ADR 0017) and the "possible correct date" search (the stamp's own country within 30 days, both sides) are unchanged.

## Consequences

- An exit whose last photos in the country are a few days before it, with the next country's photos after it, no longer warns; neither does the matching entry.
- A misread date still warns when it falls on the wrong side: an entry read before the arrival, while the photos still show the previous country.
- `scripts/demo/review.ts` mirrors the narrower check.
