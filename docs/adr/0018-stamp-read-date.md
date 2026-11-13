# ADR 0018: Stamp Read Date

## Status

Accepted.

## Context

On Review the photo location strip sets the stamp date (drag, arrow keys, buttons), as an earlier prototype's timeline did. Its reset returns to the date as read from the stamp; that prototype kept extraction results apart for that. A stamp stored only its current `date`, and `dateText` cannot be turned back into a date without the model.

## Decision

- `Stamp` gets an optional `readDate?: string | null`.
- `updateStamp` sets it on the first edit that changes `date`, to the date before that edit. Later edits never change it. Extraction does not write it.
- The strip's reset sets `date` back to `readDate` through the same edit path; the reset shows only when `readDate` is set and differs from `date`.
- No Dexie version: the field is not indexed.

## Consequences

- Stamps edited before this change have no read date; their first later date edit records the then-current date.
- A stamp replaced by a new extraction loses its read date with the old record.
