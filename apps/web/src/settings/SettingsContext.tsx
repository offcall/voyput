import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";
import { loadSettings, type Settings, saveSettings } from "./settings";

interface SettingsValue {
	settings: Settings;
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
	const value = useMemo<SettingsValue>(
		() => ({
			settings,
			update: (patch) => {
				setSettings((current) => {
					const next = { ...current, ...patch };
					saveSettings(storage, next);
					return next;
				});
			},
		}),
		[settings, storage],
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
