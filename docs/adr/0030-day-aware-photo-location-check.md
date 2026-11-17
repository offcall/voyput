# ADR 0030: Day-Aware Photo Location Check

## Status

Accepted. Supersedes how `checkStamp` picks the photo to compare with (ADR 0017's context) and the Review part of ADR 0029 (pre-dismissed warnings, the planted "correct stamp the photos put a day off"). The window setting of ADR 0017 is unchanged.

## Context

`checkStamp` compared a stamp with the single nearest photo; on the stamp's own day that was the first row by uuid. On a same-day crossing (photos at home before the flight, abroad after) one of the two stamps warned, and so did a 01:50 departure whose last photos are from the day before. Real histories have dozens of such days; the demo hid them by shipping the warnings dismissed.

## Decision

- A stamp agrees with the photos when its country has a photo on its confirming days: entry, the stamp day or the next (night arrival); exit, the stamp day or the one before (night departure); unknown direction, ±1 day. Photos of other countries on those days (home before a flight, an airside transit) do not count against it.
- Otherwise the nearest photo in another country within the window (ADR 0017, default 10 days) warns, with the same texts and the same "possible correct date" suggestion (nearest photo in the stamp's country within 30 days). With no such photo, nothing contradicts the stamp and it does not warn.
- Days only: the photo index keeps no time of day. `checkStamp` takes the stamp's `direction` as an optional field.
- The demo ships no dismissed warnings; the generator fails if a stamp other than a planted misread date warns. The Bangkok 01:50 exit is no longer a planted problem; a Rome entry read two days early (2018-07-03 for 2018-07-05) replaces it, so there are still 4.

## Consequences

- Review warns only when the photos around the stamp day contradict it; a stamp in a country with no photos within ±1 day while other photos are near still warns.
- A stamp read one day off in the confirming direction (an entry read a day early when photos in that country start the next day) now passes.
- `scripts/demo/review.ts` still mirrors the check; `apps/web/test/demo.test.tsx` guards it with the real one.
