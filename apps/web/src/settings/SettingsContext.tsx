import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { loadSettings, type Settings, saveSettings } from "./settings";

interface SettingsValue {
	settings: Settings;
	/** False when the last save failed; settings still work for this session. */
	persisted: boolean;
	update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({
	storage,
	children,
}: {
	storage: Storage;
	children: ReactNode;
}) {
	const [settings, setSettings] = useState(() => loadSettings(storage));
	const [persisted, setPersisted] = useState(true);
	const loaded = useRef(settings);

	useEffect(() => {
		if (settings === loaded.current) return;
		setPersisted(saveSettings(storage, settings));
	}, [settings, storage]);

	const value = useMemo<SettingsValue>(
		() => ({
			settings,
			persisted,
			update: (patch) => setSettings((current) => ({ ...current, ...patch })),
		}),
		[settings, persisted],
	);
	return (
		<SettingsContext.Provider value={value}>
			{children}
		</SettingsContext.Provider>
	);
}

export function useSettings(): SettingsValue {
	const value = useContext(SettingsContext);
	if (!value)
		throw new Error("useSettings() needs a <SettingsProvider> above it");
	return value;
}
