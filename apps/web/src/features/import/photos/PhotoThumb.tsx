import { Button } from "@voyput/ui";
import { useEffect, useState } from "react";
import type { PhotoRecord } from "../../../db/db";

/** One photo in the grid, shown with its saved rotation. */
export function PhotoThumb({
	photo,
	onRotate,
	onDelete,
}: {
	photo: PhotoRecord;
	onRotate: () => void;
	onDelete: () => void;
}) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		const next = URL.createObjectURL(photo.blob);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [photo.blob]);

	return (
		<figure style={{ margin: 0, display: "grid", gap: 4 }}>
			<div
				style={{
					aspectRatio: "1",
					display: "grid",
					placeItems: "center",
					overflow: "hidden",
					border: "1px solid var(--vp-border)",
					borderRadius: "var(--vp-radius)",
				}}
			>
				{url ? (
					<img
						src={url}
						alt={photo.name}
						data-rotation={photo.rotation}
						style={{
							maxWidth: "100%",
							maxHeight: "100%",
							transform: `rotate(${photo.rotation}deg)`,
						}}
					/>
				) : null}
			</div>
			<figcaption
				style={{
					fontSize: 12,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				}}
			>
				{photo.name}
			</figcaption>
			<div style={{ display: "flex", gap: 4 }}>
				<Button onClick={onRotate} aria-label={`Rotate ${photo.name}`}>
					↻
				</Button>
				<Button
					variant="danger"
					onClick={onDelete}
					aria-label={`Delete ${photo.name}`}
				>
					✕
				</Button>
			</div>
		</figure>
	);
}
