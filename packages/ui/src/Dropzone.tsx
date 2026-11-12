import { type DragEvent, type ReactNode, useId, useState } from "react";

export interface DropzoneProps {
	/** Comma-separated list for the file input, e.g. "image/jpeg,image/png". */
	accept: string;
	multiple?: boolean;
	label: string;
	hint?: ReactNode;
	onFiles: (files: File[]) => void;
}

/** Drop files here or pick them; reports every file it gets, filtering is the caller's job. */
export function Dropzone({
	accept,
	multiple = false,
	label,
	hint,
	onFiles,
}: DropzoneProps) {
	const inputId = useId();
	const [dragging, setDragging] = useState(false);

	const onDrop = (event: DragEvent) => {
		event.preventDefault();
		setDragging(false);
		const files = Array.from(event.dataTransfer.files);
		if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the file input inside is the keyboard path
		<div
			className="vp-dropzone"
			data-dragging={dragging ? "" : undefined}
			onDragOver={(event) => {
				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={() => setDragging(false)}
			onDrop={onDrop}
		>
			<span className="vp-dropzone-icon">
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M12 16V4m0 0-5 5m5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
				</svg>
			</span>
			<label htmlFor={inputId}>{label}</label>
			{hint ? <div>{hint}</div> : null}
			<input
				id={inputId}
				type="file"
				accept={accept}
				multiple={multiple}
				onChange={(event) => {
					const files = Array.from(event.target.files ?? []);
					event.target.value = "";
					if (files.length > 0) onFiles(files);
				}}
			/>
		</div>
	);
}
