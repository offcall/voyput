import {
	Badge,
	Card,
	Notice,
	PageHeader,
	PixelArt,
	Stack,
	TextField,
} from "@voyput/ui";
import { useEffect, useState } from "react";
import { useAi } from "../ai/AiContext";
import type { ModelOption } from "../ai/openrouter";
import { useSettings } from "./SettingsContext";
import {
	LOCATION_WINDOW_MAX,
	LOCATION_WINDOW_MIN,
	parseLocationWindow,
	type ReasoningEffort,
} from "./settings";
import "./settings.css";

export function SettingsPage() {
	const { settings, persisted, update } = useSettings();
	const ai = useAi();
	const [models, setModels] = useState<ModelOption[] | "failed">([]);
	// What the user typed; an empty model id is never stored.
	const [modelDraft, setModelDraft] = useState(settings.model);
	// The typed window; only a whole number in range is stored.
	const [windowDraft, setWindowDraft] = useState(
		String(settings.locationWindowDays),
	);
	const windowValid = parseLocationWindow(Number(windowDraft)) !== null;

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
		<Stack>
			<PageHeader
				title="Settings"
				art={<PixelArt name="globe" scale={4} />}
				description="Stamps are read by a vision model through OpenRouter, with your own key."
			/>
			{persisted ? null : (
				<Notice tone="warn" role="alert">
					This browser refused to save settings. They will be lost when you
					close the tab.
				</Notice>
			)}
			<div className="settings-column">
				<Card
					title="OpenRouter"
					art={<PixelArt name="plane" scale={3} />}
					variant={settings.openRouterKey ? "selected" : "default"}
					actions={
						settings.openRouterKey ? (
							<Badge tone="good">key set</Badge>
						) : (
							<Badge tone="warn">no key yet</Badge>
						)
					}
					description={
						<>
							Get a key at{" "}
							<a
								href="https://openrouter.ai/keys"
								target="_blank"
								rel="noreferrer"
							>
								openrouter.ai/keys
							</a>
							. Each photo is one request, billed to your OpenRouter account.
						</>
					}
				>
					<Stack>
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
					</Stack>
				</Card>
				<Card
					title="Review"
					art={<PixelArt name="stamp" scale={3} />}
					description="How stamps are compared with your iPhone photo locations."
				>
					<div className="vp-field">
						<label className="vp-field-label" htmlFor="vp-location-window">
							Photo location window: ± days
						</label>
						<input
							id="vp-location-window"
							className="vp-input settings-number"
							type="number"
							inputMode="numeric"
							min={LOCATION_WINDOW_MIN}
							max={LOCATION_WINDOW_MAX}
							step={1}
							value={windowDraft}
							aria-invalid={!windowValid}
							aria-describedby="vp-location-window-help"
							onChange={(event) => {
								setWindowDraft(event.target.value);
								const days = parseLocationWindow(Number(event.target.value));
								if (days !== null) update({ locationWindowDays: days });
							}}
						/>
						{windowValid ? null : (
							<span className="vp-field-description" role="alert">
								Enter a whole number from {LOCATION_WINDOW_MIN} to{" "}
								{LOCATION_WINDOW_MAX}. Review keeps using ±
								{settings.locationWindowDays} days.
							</span>
						)}
						<span className="vp-field-description" id="vp-location-window-help">
							The Photo location history on a stamp shows this many days before
							and after the stamp date, and a photo in another country this
							close to the stamp date is flagged.
						</span>
					</div>
				</Card>
			</div>
		</Stack>
	);
}
