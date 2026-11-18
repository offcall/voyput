# ADR 0036: Stays Saves Diffs and Follows Outside Changes

## Status

Accepted. Extends ADR 0019 (stays as source of truth) and ADR 0031 (changed-evidence flags).

## Context

The Stays page read the history once and saved every edit, undo and redo by clearing the `stays` table and writing its in-memory copy back. Other writers change `stays` too: `staysAfterEvidenceChange` (Review, Import, Extract, location CSV), the birth setting in Settings, demo load and removal, and the same page in another tab. Their changes were silently overwritten by the next edit on the page, which also dropped the ADR 0031 `evidenceChanged` flags before the user had picked an answer.

## Decision

- The page saves an edit as a diff against the history it last read or saved (`saveStayChanges` in `apps/web/src/features/trips/tripStore.ts`), in one `rw` transaction: it puts the stays that differ and deletes the ids that are gone. Stays the edit did not touch are not written.
- A touched stay is merged field by field with what is stored now: a field the edit left as it was keeps its stored value, a field the edit changed takes the edit's value. So a flag or a dropped stamp id written elsewhere survives, and "Re-suggest" or "Keep as is" still clear the flag because they change it. Since an edge (`arrival`, `departure`) is one field, the merge then drops any edge `stampId`, `stampIds` or `photoIds` entry that the stored row no longer has and the edit did not add, so editing the same edge or list never brings back a deleted stamp or photo; an edge that loses its stamp becomes `estimated`, as in ADR 0031. A stay deleted elsewhere is not brought back.
- The page subscribes to `db.stays` with Dexie `liveQuery`, which also sees writes from other tabs. Its own saves are recognised and ignored; any other change reloads the page's data and starts a fresh undo history, so Undo never writes back a history from before the outside change.
- `saveStays` (clear and write all) stays for Settings' birth change and its Undo, which replace the history as a whole inside their own transaction.

## Alternatives

- Rebasing the undo history onto the outside change: keeps Undo across it, but each past snapshot would need the same three-way merge, and an undo could still mean something the user never saw. Resetting is simpler and safe.
- A per-stay revision number with an optimistic check: catches conflicts, but needs a schema change and a way to show the conflict; the field merge covers the writers we have.

## Consequences

- An outside change clears the page's Undo and the open toast.
- When the page and another writer change the same field of the same stay at about the same time, the page's value wins, apart from evidence ids the other writer dropped.
