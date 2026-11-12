/** One physical passport. Its photos are the pages the user uploaded. */
export interface Passport {
	id: string;
	name: string;
	/** Validity window, used to flag misread stamp years. */
	validFrom: string | null;
	validTo: string | null;
	createdAt: string;
}

export type Rotation = 0 | 90 | 180 | 270;

export const SUPPORTED_PHOTO_TYPES = ["image/jpeg", "image/png"] as const;
export type PhotoMimeType = (typeof SUPPORTED_PHOTO_TYPES)[number];

/** A passport page photo without its bytes. */
export interface PassportPhoto {
	id: string;
	passportId: string;
	name: string;
	mimeType: PhotoMimeType;
	rotation: Rotation;
	/** File size in bytes, used with the name to skip re-added files; absent for older and demo photos. */
	size?: number;
	addedAt: string;
}
