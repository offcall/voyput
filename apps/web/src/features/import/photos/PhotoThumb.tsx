import { Link } from "@tanstack/react-router";
import { Badge, Button } from "@voyput/ui";
import { useEffect, useState } from "react";
import type { PhotoRecord } from "../../../db/db";
import type { PhotoStatus } from "./passportStore";

/**
 * One photo in the grid, shown with its saved rotation. The picture opens the
 * photo in Review; the actions sit above that link and appear on hover or focus.
 */
export function PhotoThumb({
	photo,
	status,
	onRotate,
	onDelete,
}: {
	photo: PhotoRecord;
	status?: PhotoStatus | undefined;
	onRotate: () => void;
	onDelete: () => void;
}) {
	const [url, setUrl] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a photo's bytes never change, but every table change hands us a new Blob instance
	useEffect(() => {
		const next = URL.createObjectURL(photo.blob);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [photo.id]);

	return (
		<figure className="import-thumb">
			<div className="import-thumb-frame">
				<Link
					to="/collect/$step"
					params={{ step: "review" }}
					search={{ photo: photo.id }}
					className="import-thumb-open"
					aria-label={`Open ${photo.name} in Review`}
					title={`Open ${photo.name} in Review`}
				>
					{url ? (
						<img
							src={url}
							alt={photo.name}
							data-rotation={photo.rotation}
							data-sideways={photo.rotation % 180 !== 0 ? "" : undefined}
							style={{ rotate: `${photo.rotation}deg` }}
						/>
					) : null}
				</Link>
				<div className="import-thumb-actions">
					<Button
						size="sm"
						square
						onClick={onRotate}
						aria-label={`Rotate ${photo.name}`}
						title="Rotate 90°"
					>
						↻
					</Button>
					<Button
						size="sm"
						square
						variant="danger"
						onClick={onDelete}
						aria-label={`Delete ${photo.name}`}
						title="Delete"
					>
						✕
					</Button>
				</div>
				{status ? (
					<div className="import-thumb-status">
						<StatusBadge status={status} />
					</div>
				) : null}
			</div>
			<figcaption title={photo.name}>{photo.name}</figcaption>
		</figure>
	);
}

function StatusBadge({ status }: { status: PhotoStatus }) {
	switch (status.kind) {
		case "new":
			return <Badge>not extracted</Badge>;
		case "failed":
			return <Badge tone="bad">failed</Badge>;
		case "ok":
			return (
				<Badge tone="good">
					{status.stamps} {status.stamps === 1 ? "stamp" : "stamps"}
				</Badge>
			);
	}
}
