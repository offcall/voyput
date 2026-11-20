# ADR 0022: Stays Without Home

## Status

Accepted. Supersedes the home and derived-trip parts of ADR 0019. No-home part (days without evidence are only gaps) superseded by ADR 0051, which adds an optional assumed home.

## Context

ADR 0019 filled the time between trips with stays in a home country (the country of most stays or the user's pick) and grouped the stays abroad into derived trips. Many users do not live in one place: the made-up home stays were noise, the "Home: X · change" control asked for something that does not exist, and trips hid the stays users want to edit. The country that matters is the birth country, for the first stay.

## Decision

- No home and no trips. `homeOf`, `deriveTrips`, `guessHomeCountry`, `homeAfterTrips` and the `Trip` type go. The Trips step lists one flat history of stays, newest or oldest first (`trips:order` in `kv`), numbered in date order.
- `suggestStays` emits stays only where stamps or photos are. Before the first stamp and after each exit the place is unknown: photos fill it from their first to their last day (snapping to a stamp a day away), else the days stay a gap. Stays of one country join only when they touch or overlap, so repeated visits across unknown days stay apart. A gap of more than one day is shown as a "gap · N days" row, not a hint or error; a stamp inside it is still an error (`stamp-mismatch`). `gapBetween` computes it.
- Birth country (`trips:birthCountry` in `kv`) and birth date together start the history with a stay there "since birth" (`withBirthStay`); either alone adds nothing. Both are part of the undoable snapshot. The stay added for them is marked `sinceBirth` and follows the setting (new country, removed when incomplete) until the user edits it.
- Days abroad are days in stays outside the birth country, or all stay days when none is set (Explore `Stay.abroad`, Collect plan).
- Editing: `splitStay` cuts a stay at a day into two of its country, evidence by day; `addStay` adds a stay with hand-set edges. Stays the user changes, splits or adds get `edited: true`; "Rebuild suggestions" keeps approved and edited stays. Everything goes through undo/redo and is saved.
- Visualize reads stays: the chart filter picks countries or single stays (`splitRowsByRanges`), the Route player captions and jumps per stay (`stayIds`, `stayStarts`), and every stay walks through its own photos.
- Periods of trips deleted before stays (`trips:dismissed`) drop the stays that begin inside them; nothing fills them.
- Dexie version 5 deletes only stored stays it can prove the old suggestion made up and nobody touched: in the home country under the id they were suggested with, kind `stay`, no stamp, photo, place or approval, estimated edges, and travel methods unknown or inferred from the neighbours. Version 4 stored no edit flag, so anything that may have been edited stays. The `trips:home` key goes.

## Consequences

- Histories show gaps where nothing is known instead of an assumed home.
- The Route's "Stays & photos" mode has more stops: long stays in one country walk through all their photo clusters.
- The Collect step keeps its id and URL (`/collect/trips`) but is labelled "Stays".
