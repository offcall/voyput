# ADR 0047: Stamp Boxes

## Status

Accepted.

## Context

A page can hold ten stamps. On Review the user could not tell which stamp on the photo is which card. The model already looks at each stamp, so it can say where it is.

## Decision

- The extraction prompt asks for each stamp's `box`: `[x, y, width, height]` as fractions 0..1 of the image the model saw, from the top-left corner.
- `parsePhotoResponse` reads it with `parseBox`: four finite numbers, clamped to the image, width and height above 0. Anything else drops the box, with no warning and no error; the stamp stays.
- The model sees the photo turned by the user's rotation. Extraction and rescan turn the box back (`unrotateBox`), so `Stamp.box?: { x, y, width, height }` is stored in the frame of the stored, unturned photo (with its EXIF orientation applied, as the browser shows it). A later rotation never makes it stale.
- No Dexie version: the field is optional and not indexed, as with `readDate` (ADR 0018).
- Review draws the boxes on the photo, numbered as the cards; they turn, zoom and pan with it.
- The model trial does not score boxes; its ground truth is unchanged.

## Consequences

- Older stamps and stamps added by hand have no box; Review shows their cards without an outline. A re-extract adds boxes to unreviewed AI stamps.
- Box quality depends on the model; a wrong box only misplaces an outline.
