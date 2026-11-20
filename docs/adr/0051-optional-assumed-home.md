# ADR 0051: Optional Assumed Home

## Status

Accepted. Supersedes the "no home" part of ADR 0022 (days without evidence are only gaps); trips stay gone.

## Context

ADR 0022 removed the home country: many users do not live in one place, and made-up home stays were noise. Users who do live in one place see long "gap · N days" rows and lower day counts for their home country than they expect. They want to say once where unknown days are, without adding stays by hand.

## Decision

- Off by default. Settings › Profile has "Fill unknown days with" (Nothing or a country, `trips:assumedHome` in `kv`) and "Count assumed days" (`trips:countAssumed`, absent means on). Changes go through the card's undo, like the birth setting.
- Core `assumedHomeGaps` takes the gaps between stays (`gapBetween`) and the days after the last stay up to today, and assumes them in that country. A gap with a usable stamp inside is not filled: the stamp says where the traveller was, and it stays a `stamp-mismatch` error. Hints, statuses and approval ignore assumed days.
- Assumed days are never stored and never replace a stay. The Stays list shows them as a hatched gap row with the country and an "assumed home" badge; "+ Add stay" still adds a real stay there. Without the setting the list is as before.
- Insights add them as `Stay` rows with `assumed: true` (Explore `buildStays` option `assumed`) only while "Count assumed days" is on. Assumed days are in the home country, so `abroad` is false: days abroad do not change. The per-country days, calendar and timeline include them, drawn lighter and hatched. The stays count leaves them out, and the Journey does not play them. The Schengen 90/180 count reads stamps on the Review step, so assumed days never reach it.
- Counting defaults to on: a user who names a home wants its days counted. Turning it off keeps the list rows and leaves Insights as without the setting.

## Consequences

- Users who live in one place get a full history and home-country day counts without made-up stored stays; everyone else sees no change.
- An assumed stay in Insights has an id `assumed-<first day>`, which is not a stay of the history.
- Other Insights lists (moves, longest stays, the every-stay table) show counted assumed days as stays in the home country; turning counting off removes them.
