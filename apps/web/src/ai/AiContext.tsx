import { createContext, type ReactNode, useContext } from "react";
import type { AiClient } from "./openrouter";

const AiContext = createContext<AiClient | null>(null);

export function AiProvider({
	client,
	children,
}: {
	client: AiClient;
	children: ReactNode;
}) {
	return <AiContext.Provider value={client}>{children}</AiContext.Provider>;
}

export function useAi(): AiClient {
	const client = useContext(AiContext);
	if (!client) throw new Error("useAi() needs an <AiProvider> above it");
	return client;
}
