# ADR 0046: Photo Check Suggests a Misread Year

## Status

Accepted. Amends ADR 0030 and ADR 0045: when `checkStamp` gives a suggestion with no warning, and how the fix date reaches Review.

## Context

A stamp read with the wrong year (2016 for 2017) has no photos in its country around its date. When no photo in another country is near either, ADR 0030 says nothing contradicts the stamp, so nothing warned; with a warning, the suggestion only searched the stamp's country within 30 days and so said "check by hand". Review found the one-click fix date by parsing the suggestion text.

## Decision

- When the stamp's country has no photo on its confirming days and none within 30 days, `checkStamp` looks at the same date one year earlier and one year later, ±3 days, in the stamp's own country. If photos are there, it suggests that year ("Maybe 2017? Photos in United States from 2017-08-12 to 2017-08-15"); the year whose nearest photo is closer wins, the earlier on a tie. 29 February becomes 28 February in the other year.
- This suggestion comes with or without a warning. Without one it is only a suggestion: it does not change the severity, the queue or the counts, and "Looks right" hides it like any suggestion. With a warning it replaces the "No photos in … within 30 days" text.
- `StampCheck` gets an optional `fixDate`: the date a suggestion points to (the nearest own-country photo within 30 days, or the stamp date in the other year). Review's "Move to <date>" uses it instead of parsing the text.
- The warnings, the window and the confirming and contradicting days are unchanged.

## Consequences

- A stamp with a misread year and no photo near it now shows a quiet suggestion with a fix under its row.
- A stamp whose country has photos within 30 days of its date never gets a year suggestion.
- `scripts/demo/review.ts` is unchanged: it mirrors only the warning.
