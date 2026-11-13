# ADR 0017: Photo Location Window Setting

## Status

Accepted.

## Context

Review compares each stamp with the iPhone photo locations around its date: the stamp card draws a strip of days, and `checkStamp` warns when the nearest photo within 10 days is in another country. Both used a fixed 10 days. The maintainer wants the window adjustable.

## Decision

- Settings has "Photo location window: ± N days", stored as `locationWindowDays` in the settings record in localStorage. Default 10, whole numbers from 3 to 60; a stored value out of range falls back to 10.
- Core `checkStamp(index, stamp, window = 10)` takes the window as an optional third parameter. Its other limits (2 days "near", 30-day suggestion search) stay fixed.
- Review passes the setting to the stamp card strip, the Timeline tab rows and every `checkStamp` call.

## Consequences

- Callers that omit the window keep the old 10-day behaviour.
- Changing the setting changes which stamps carry a photo location warning, and so the Review filters and counts.
