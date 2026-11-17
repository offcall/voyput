# ADR 0031: Stays Flag Changed Evidence

## Status

Accepted. Extends ADR 0019 (stored stays do not follow later imports on their own).

## Context

Stored stays keep the ids of the stamps and photo locations they were built from. Deleting a stamp, a passport page or a passport, or editing a stamp's date or country, left stays pointing at missing or changed stamps, with nothing on the Stays step to say so. Rebuilding everything is not an answer: approved and edited stays are the user's, and must not be deleted or moved without them.

## Decision

- `TravelStay` gets an optional `evidenceChanged: true`: a stamp or photo behind the stay was deleted, or a stamp's date, country, direction, crossing or review state changed, since the stay was built. A missing field reads as unchanged, so stored stays need no upgrade. The field is not indexed, so the Dexie schema stays at version 5.
- Every delete or edit of that evidence (also a re-extraction replacing unreviewed stamps, and a location CSV that drops rows stays use or gives them another day or country) calls `staysAfterEvidenceChange` (`apps/web/src/features/trips/evidenceChange.ts`) in the same transaction. It runs core `flagChangedEvidence` on the stored stays: ids of deleted stamps and photos go, an edge read from a deleted stamp becomes an estimate on the same day, and the stays involved are flagged. No stay is deleted, moved or unapproved. While nothing is stored, the suggestion follows the evidence by itself and nothing is written.
- The Stays list shows a flagged stay's status as "evidence changed", with "Re-suggest this stay" (core `resuggestStay`: suggested again from today's evidence, within its own days only, the other stays untouched) and "Keep as is" (the flag goes, the stay counts as edited). Both are Stays edits with Undo. A flagged stay cannot be approved, in bulk or from its panel, until the user picks one.
- Review's Undo of a stamp delete takes back only what the delete did: the stamp's ids and edges come back, later changes stay, and the flag stays while other evidence of the stay changed since.

## Consequences

- Deleting a passport flags every stored stay that used one of its stamps; the user goes through them one by one.
- New stamps and new CSV rows still reach stored stays only through "Rebuild suggestions".
- Removing demo data keeps its own rule (ADR 0010, `withoutEvidence`): stays built only on demo evidence go.
