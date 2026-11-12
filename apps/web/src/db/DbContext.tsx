import { createContext, type ReactNode, useContext } from "react";
import type { VoyputDb } from "./db";

const DbContext = createContext<VoyputDb | null>(null);

export function DbProvider({
	db,
	children,
}: {
	db: VoyputDb;
	children: ReactNode;
}) {
	return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): VoyputDb {
	const db = useContext(DbContext);
	if (!db) throw new Error("useDb() needs a <DbProvider> above it");
	return db;
}
