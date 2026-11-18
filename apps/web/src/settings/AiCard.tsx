import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
	Badge,
	Button,
	Card,
	Notice,
	PixelArt,
	Stack,
	TextField,
} from "@voyput/ui";
import { useEffect, useState } from "react";
import { useAi } from "../ai/AiContext";
import { type LocalHealth, localCommands, parsePairingHash } from "../ai/local";
import type { ModelOption } from "../ai/openrouter";
import { useSettings } from "./SettingsContext";
import {
	type AiProviderId,
	type LocalEngine,
	parsePort,
	type ReasoningEffort,
} from "./settings";
import "./ai-card.css";

const PROVIDERS: { id: AiProviderId; label: string }[] = [
	{ id: "openrouter", label: "OpenRouter (key in this browser)" },
	{
		id: "local",
		label: "Local (your Codex or Claude Code subscription, this computer only)",
	},
];

type Pairing = NonNullable<ReturnType<typeof parsePairingHash>>;

/** Settings for whoever reads the stamps: OpenRouter or voyput-local (ADR 0026). */
export function AiCard() {
	const { settings, update } = useSettings();
	const navigate = useNavigate();
	const hash = useRouterState({ select: (state) => state.location.hash });
	const [offer, setOffer] = useState<Pairing | null>(null);
	const [paired, setPaired] = useState(false);

	// A pairing link from voyput-local: `/settings#local=<token>&port=<n>`.
	// Nothing is applied until the user confirms (ADR 0035); the token leaves
	// the address bar and the router's location right away.
	useEffect(() => {
		if (!new URLSearchParams(hash).has("local")) return;
		setOffer(parsePairingHash(hash));
		setPaired(false);
		void navigate({ to: "/settings", hash: "", replace: true });
	}, [hash, navigate]);

	const ready =
		settings.aiProvider === "local"
			? Boolean(settings.localToken)
			: Boolean(settings.openRouterKey);

	return (
		<Card
			title="AI"
			art={<PixelArt name="plane" scale={3} />}
			variant={ready ? "selected" : "default"}
			actions={
				settings.aiProvider === "local" ? (
					settings.localToken ? (
						<Badge tone="good">paired</Badge>
					) : (
						<Badge tone="warn">not paired</Badge>
					)
				) : settings.openRouterKey ? (
					<Badge tone="good">key set</Badge>
				) : (
					<Badge tone="warn">no key yet</Badge>
				)
			}
			description="Extract, Validate and Rescan use the reader chosen here."
		>
			<Stack>
				<fieldset className="ai-providers">
					<legend className="vp-field-label">Read stamps with</legend>
					{PROVIDERS.map((provider) => (
						<label key={provider.id} className="ai-provider">
							<input
								type="radio"
								name="vp-ai-provider"
								value={provider.id}
								checked={settings.aiProvider === provider.id}
								onChange={() => update({ aiProvider: provider.id })}
							/>
							<span>{provider.label}</span>
						</label>
					))}
				</fieldset>
				{offer ? (
					<PairingOffer
						offer={offer}
						onPair={() => {
							update({ aiProvider: "local", ...offer });
							setOffer(null);
							setPaired(true);
						}}
						onCancel={() => setOffer(null)}
					/>
				) : null}
				{paired ? (
					<Notice tone="good" role="status">
						Paired with voyput-local from its link.
					</Notice>
				) : null}
				{settings.aiProvider === "local" ? (
					<LocalFields />
				) : (
					<OpenRouterFields />
				)}
			</Stack>
		</Card>
	);
}

/** Asks before a pairing link changes the AI settings. */
function PairingOffer({
	offer,
	onPair,
	onCancel,
}: {
	offer: Pairing;
	onPair: () => void;
	onCancel: () => void;
}) {
	const { settings } = useSettings();
	const replaces =
		settings.localToken !== "" &&
		(settings.localToken !== offer.localToken ||
			settings.localPort !== offer.localPort);
	return (
		<section className="ai-pairing" aria-label="Pairing link">
			<p className="ai-pairing-title">
				Pair with voyput-local on 127.0.0.1:{offer.localPort}?
			</p>
			<p className="vp-field-description">
				Only pair with a link that voyput-local printed on this computer just
				now. Photos to read will go to the program on port {offer.localPort}.
			</p>
			{replaces ? (
				<p className="vp-field-description" role="alert">
					This replaces your current pairing (port {settings.localPort}).
				</p>
			) : null}
			{settings.aiProvider === "openrouter" ? (
				<p className="vp-field-description" role="alert">
					This switches stamp reading from OpenRouter to voyput-local.
				</p>
			) : null}
			<div className="ai-pairing-actions">
				<Button variant="primary" onClick={onPair}>
					Pair
				</Button>
				<Button variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</section>
	);
}

function OpenRouterFields() {
	const { settings, update } = useSettings();
	const ai = useAi();
	const [models, setModels] = useState<ModelOption[] | "failed">([]);
	// What the user typed; an empty model id is never stored.
	const [modelDraft, setModelDraft] = useState(settings.model);

	useEffect(() => {
		let current = true;
		ai.listImageModels().then(
			(list) => current && setModels(list),
			() => current && setModels("failed"),
		);
		return () => {
			current = false;
		};
	}, [ai]);

	return (
		<>
			<p className="vp-field-description">
				Get a key at{" "}
				<a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
					openrouter.ai/keys
				</a>
				. Each photo is one request, billed to your OpenRouter account.
			</p>
			<TextField
				label="API key"
				type="password"
				value={settings.openRouterKey}
				onChange={(openRouterKey) => update({ openRouterKey })}
				description="Stored in this browser only. Requests go straight from here to OpenRouter."
			/>
			<div className="vp-field">
				<label className="vp-field-label" htmlFor="vp-model">
					Model
				</label>
				<input
					id="vp-model"
					className="vp-input"
					list="vp-image-models"
					value={modelDraft}
					aria-invalid={modelDraft.trim() === ""}
					onChange={(event) => {
						setModelDraft(event.target.value);
						const model = event.target.value.trim();
						if (model) update({ model });
					}}
				/>
				{modelDraft.trim() === "" ? (
					<span className="vp-field-description" role="alert">
						Enter a model id. Extraction keeps using {settings.model}.
					</span>
				) : null}
				<span className="vp-field-description">
					{models === "failed"
						? "Could not load the model list. Type any OpenRouter model id that accepts images."
						: `Type to search ${models.length || "the"} OpenRouter models that accept images.`}
				</span>
				<datalist id="vp-image-models">
					{models === "failed"
						? null
						: models.map((model) => (
								<option key={model.id} value={model.id}>
									{model.name}
								</option>
							))}
				</datalist>
			</div>
			<label className="vp-field">
				<span className="vp-field-label">Reasoning effort</span>
				<select
					className="vp-input"
					value={settings.reasoningEffort}
					onChange={(event) =>
						update({
							reasoningEffort: event.target.value as ReasoningEffort,
						})
					}
				>
					<option value="low">low</option>
					<option value="medium">medium</option>
					<option value="high">high</option>
				</select>
			</label>
		</>
	);
}

type HealthView = LocalHealth | { state: "checking" } | { state: "unpaired" };

const ENGINE_LABELS: Record<LocalEngine, string> = {
	auto: "Auto (Claude Code if found, else Codex)",
	codex: "Codex CLI",
	claude: "Claude Code",
};

function HealthBadge({ health }: { health: HealthView }) {
	switch (health.state) {
		case "found":
			return (
				<Badge tone="good" dot>
					Found · v{health.version} ·{" "}
					{health.engines.length
						? health.engines.map((engine) => ENGINE_LABELS[engine]).join(", ")
						: "no CLI found"}
				</Badge>
			);
		case "unverified":
			return (
				<Badge tone="bad" dot>
					Not your voyput-local
				</Badge>
			);
		case "wrong-token":
			return (
				<Badge tone="bad" dot>
					Wrong token
				</Badge>
			);
		case "not-running":
			return (
				<Badge tone="warn" dot>
					Not running
				</Badge>
			);
		case "error":
			return (
				<Badge tone="bad" dot>
					Error: {health.message}
				</Badge>
			);
		case "checking":
			return <Badge dot>Checking…</Badge>;
		case "unpaired":
			return <Badge dot>Not paired</Badge>;
	}
}

function CommandLine({ label, command }: { label: string; command: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="vp-field">
			<span className="vp-field-label">{label}</span>
			<div className="ai-command">
				<code>{command}</code>
				<Button
					size="sm"
					onClick={() =>
						navigator.clipboard?.writeText(command).then(
							() => setCopied(true),
							() => setCopied(false),
						)
					}
				>
					{copied ? "Copied" : "Copy"}
				</Button>
			</div>
		</div>
	);
}

function LocalFields() {
	const { settings, update } = useSettings();
	const ai = useAi();
	const [health, setHealth] = useState<HealthView>({ state: "checking" });
	const [check, setCheck] = useState(0);
	const [portDraft, setPortDraft] = useState(String(settings.localPort));
	const commands = localCommands(window.location.origin, settings.localPort);
	const { localToken, localPort } = settings;

	useEffect(() => {
		void check;
		if (!localToken) {
			setHealth({ state: "unpaired" });
			return;
		}
		let current = true;
		setHealth({ state: "checking" });
		// Wait for typing to pause before asking the server.
		const timer = setTimeout(() => {
			const ask = ai.localHealth
				? ai.localHealth({ localToken, localPort })
				: Promise.resolve<LocalHealth>({ state: "not-running" });
			ask.then(
				(result) => current && setHealth(result),
				() => current && setHealth({ state: "not-running" }),
			);
		}, 300);
		return () => {
			current = false;
			clearTimeout(timer);
		};
	}, [ai, localToken, localPort, check]);

	// A pairing link can change the port; keep the field in step.
	useEffect(() => {
		setPortDraft((draft) =>
			parsePort(Number(draft)) === localPort ? draft : String(localPort),
		);
	}, [localPort]);

	const found = health.state === "found" ? health.engines : null;

	return (
		<>
			<Notice tone="info">
				Local works only on your own computer: voyput-local runs there, and this
				browser reaches it at 127.0.0.1. On a phone or another computer, use
				OpenRouter.
			</Notice>
			<CommandLine
				label="Run in a terminal (Node 22.12 or newer)"
				command={commands.download}
			/>
			<CommandLine label="Or, in a clone of voyput" command={commands.clone} />
			<p className="vp-field-description">
				It prints a pairing link: open it, or paste the token below. It needs
				Claude Code or Codex CLI installed and logged in. Codex runs without a
				shell but keeps a few tools that cannot be turned off, so it is less
				confined than Claude Code, which gets no tools at all; add{" "}
				<code>--no-codex</code> to leave it out.
			</p>
			<div className="ai-status" aria-live="polite">
				<span className="vp-field-label">Status</span>
				<HealthBadge health={health} />
				<Button
					size="sm"
					variant="ghost"
					disabled={!localToken}
					onClick={() => setCheck((n) => n + 1)}
				>
					Check again
				</Button>
			</div>
			{health.state === "wrong-token" ? (
				<p className="vp-field-description" role="alert">
					voyput-local runs but does not know this token. Open the link it
					printed, or paste its token.
				</p>
			) : null}
			{health.state === "unverified" ? (
				<p className="vp-field-description" role="alert">
					Something answers on 127.0.0.1:{localPort} but cannot prove it knows
					your token, so no photo will be sent to it. Stop it and start
					voyput-local.
				</p>
			) : null}
			<TextField
				label="Pairing token"
				type="password"
				value={settings.localToken}
				onChange={(token) => update({ localToken: token.trim() })}
				description="Stored in this browser only and never sent: requests are signed with it, photos and answers are encrypted with it, and voyput-local must prove it knows it before a photo is sent."
			/>
			<div className="ai-local-row">
				<label className="vp-field">
					<span className="vp-field-label">Engine</span>
					<select
						className="vp-input"
						value={settings.localEngine}
						onChange={(event) =>
							update({ localEngine: event.target.value as LocalEngine })
						}
					>
						{(Object.keys(ENGINE_LABELS) as LocalEngine[]).map((engine) => (
							<option key={engine} value={engine}>
								{ENGINE_LABELS[engine]}
								{found && engine !== "auto" && !found.includes(engine)
									? " (not available)"
									: ""}
							</option>
						))}
					</select>
				</label>
				<label className="vp-field">
					<span className="vp-field-label">Port</span>
					<input
						className="vp-input settings-number"
						type="number"
						inputMode="numeric"
						min={1}
						max={65535}
						value={portDraft}
						aria-invalid={parsePort(Number(portDraft)) === null}
						onChange={(event) => {
							setPortDraft(event.target.value);
							const port = parsePort(Number(event.target.value));
							if (port !== null) update({ localPort: port });
						}}
					/>
				</label>
			</div>
			<p className="vp-field-description">
				Nothing goes to voyput: each photo goes from this browser to
				voyput-local, then to OpenAI (Codex) or Anthropic (Claude Code) under
				your own account. Safari may block this page from reaching 127.0.0.1;
				use Chrome or Firefox, or run voyput from a clone.
			</p>
		</>
	);
}
