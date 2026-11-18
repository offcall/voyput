# ADR 0037: Country Outlines from Map Units

## Status

Accepted. Amends ADR 0033 (source of the country outlines).

## Context

ADR 0033 builds `country-outlines.json` from Natural Earth 10m admin 0 *countries* and takes each outline's code from `ISO_A2_EH`. That layer draws overseas territories inside their parent country: Réunion, French Guiana, Guadeloupe, Martinique and Mayotte are FR, the Caribbean Netherlands NL, Svalbard and Bouvet Island NO, Cocos and Christmas Islands AU, Tokelau NZ. A photo taken in Réunion counted as France, so an RE stamp got a warning and stays were wrong, against ADR 0033's claim that every ISO territory has an outline (code review of 2026-11-18).

## Decision

- `npm run world:outlines` reads Natural Earth 10m admin 0 *map units* (`ne_10m_admin_0_map_units.geojson`, public domain), which keep those territories as their own units with their own `ISO_A2_EH`.
- A unit's code is, in order: an override by `SU_A3` (Jan Mayen is SJ, the UNDOF zone SY instead of Natural Earth's `XD`, the nine U.S. minor islands UM instead of US), its `ISO_A2_EH`, or, for units without a code, the `NO_CODE` mapping of ADR 0033 by name (now also each half of the Korean DMZ to KR or KP). Units that split a country (England, Wales, Flanders, Azores, Zanzibar, ...) keep the parent's code and add rings to it.
- Crimea (2026-11-18): Natural Earth puts it in Russia's unit as one separate part; the map draws it as Ukraine. The RU part that lies inside a Crimea box is UA, so a photo in Simferopol or Sevastopol counts as Ukraine, as on the map. The script stops if it does not find exactly one such part.
- Format, rounding, lookup and loading stay as in ADR 0033.

## Consequences

- RE, GF, GP, MQ, YT, BQ, SJ, BV, CC, CX and TK have outlines (250 codes, up from 239); the mainland of FR, NO, NL, AU and NZ no longer covers them.
- The file is 4.47 MB (1.77 MB gzipped), about 1% more than before, from the inner borders between map units.
- Clipperton stays FR (ISO 3166 has no code of its own for it).
