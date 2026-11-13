import { useEffect, useState } from "react";
import type { PhotoRecord } from "../../db/db";

/** A small picture of a page; the full photo scaled down by the browser. */
export function Thumb({
	photo,
	className = "review-thumb",
}: {
	photo: Pick<PhotoRecord, "blob" | "rotation">;
	className?: string;
}) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		// A record whose blob did not survive storage gets an empty frame, not a crash.
		if (!(photo.blob instanceof Blob)) return;
		const next = URL.createObjectURL(photo.blob);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [photo.blob]);
	return (
		<span className={className} data-rotation={photo.rotation}>
			{url ? (
				<img
					src={url}
					alt=""
					loading="lazy"
					style={{ transform: `rotate(${photo.rotation}deg)` }}
				/>
			) : null}
		</span>
	);
}
