/**
 * Whether the browser keeps this site's IndexedDB when space runs low
 * (StorageManager.persist). Behind a small interface, so tests need no real
 * browser API. Every call resolves; `null` means the browser cannot tell or ask.
 */
export interface StorageKeeper {
	persisted(): Promise<boolean | null>;
	/** Asks the browser to keep the data; true when it agreed. */
	persist(): Promise<boolean | null>;
}

const manager = (): StorageManager | null => {
	const storage =
		typeof navigator === "undefined" ? undefined : navigator.storage;
	return storage &&
		typeof storage.persist === "function" &&
		typeof storage.persisted === "function"
		? storage
		: null;
};

const safely = async (
	call: (storage: StorageManager) => Promise<boolean>,
): Promise<boolean | null> => {
	const storage = manager();
	if (!storage) return null;
	try {
		return await call(storage);
	} catch {
		return null;
	}
};

export const browserStorageKeeper: StorageKeeper = {
	persisted: () => safely((storage) => storage.persisted()),
	persist: () => safely((storage) => storage.persist()),
};

const ASKED_KEY = "voyput:storage-persist-asked";

/**
 * After the first real data (a passport photo or a location file): asks the
 * browser once to keep the data. Later calls do nothing. Never throws.
 */
export async function keepStorageOnce(
	keeper: StorageKeeper = browserStorageKeeper,
): Promise<void> {
	try {
		if (localStorage.getItem(ASKED_KEY)) return;
		localStorage.setItem(ASKED_KEY, new Date().toISOString());
	} catch {
		return;
	}
	if ((await keeper.persisted()) === false) await keeper.persist();
}
