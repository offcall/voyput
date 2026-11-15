# ADR 0023: Navigation and Insights

## Status

Accepted. Supersedes the Visualize part of ADR 0015.

## Context

The sidebar listed Collect and 13 Visualize tabs. Explore repeated what Periods, Countries, Calendar, Year × country and Moves showed; Map, Heatmap and Globe were three tabs for one map; every tab had a big banner, and Explore a large filter block next to a second, different stay filter. With 40–50 countries every list and legend grew to 50 entries.

## Decision

- The sidebar has three areas: **Collect** (with its x/5 badge), **Stays** and **Insights**, then Settings, the theme switch and a "Local only" note at the bottom. Stays is the Collect Stays step at its existing URL `/collect/trips`; on `/collect/trips*` Stays is active, on other `/collect/*` paths Collect is.
- Insights has four views, each its own route `/insights/<view>`: **Journey** (the Route player), **Map** (flat, heat and globe behind a switch; the choice is in `?mode=` and remembered in localStorage), **Calendar** (stay timeline, day calendar, photos per day) and **Stats** (key numbers, then sections Countries, Years, Moves, Periods, Distance, Records with in-page anchors).
- `/visualize` and every old `/visualize/<tab>` redirect (replace) to the view that holds that content now, keeping search params; the Map tabs set `mode`, Stats sections are a URL hash (`/insights/stats#moves`).
- One filter for all views: Explore's filters plus a single-stay filter, kept in the Insights layout. It opens from a "Filter" button in the page header and shows as removable chips. Photo charts show the photos inside the filtered stays. The old stored-stay checkbox filter is gone; a stay detail's "Show only this stay" replaces its single-stay list.
- Each view has one header (title and one-line subtitle) and at most one one-line hint, chosen by what data exists: no photo locations, no stamps, or only suggested stays.
- Ranked lists show 10 rows with "Show all N"; the 10 countries with the most days keep their colour and every other country is one neutral tone inside Insights.

## Consequences

- Old Visualize links keep working through the redirects; links to them can be updated over time.
- The view list is one registry (`features/visualize/views.ts`) read by the router, the nav and the redirects.
- The filter now covers suggested stays too, not only saved ones.
