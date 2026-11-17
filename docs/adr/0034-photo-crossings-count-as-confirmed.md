# ADR 0034: Photo Crossings Count as Confirmed

## Status

Accepted. Changes which stays "Approve" takes in bulk (`clearStayIds`); stays still need approval.

## Context

A stay was "ready" (approved in bulk) only when both its edges were exact: a stamp or a date set by hand. With photo locations only, no edge is ever exact, so every stay waited for a one-by-one review: a library of ~30k photos gave about 150 stays, 0 ready, and no clear way to the results. A photo crossing is dated by the first photo in the next country, so the departure and the next arrival always share a date; how close the evidence really is shows only in the photos themselves.

## Decision

- An edge dated by photos counts as confirmed when the evidence on both sides of that crossing meets: the last stamp or photo before it and the first after it are at most one day apart. An exact edge on the other side (a stamp, a hand-set date) counts with its date. Estimated edges never count, and the first arrival and the last departure have no other side (birth and "still there" count as before).
- Everything else that keeps a stay out of bulk approval stays: errors, warnings, changed evidence.
- `clearStayIds` takes the photo days (`LocationRow.uuid` → day). Without them, photo edges never count, as before.

## Consequences

- A photos-only history is mostly ready after import: one click approves every crossing the photos pin to a day; what is left to check are the crossings with days without photos around them, and stays with hints.
- A day of slack can approve a crossing dated a day late (an overnight bus with no photos on the way). That stay still shows its photo days on the timeline, and an approved stay can be reopened.
