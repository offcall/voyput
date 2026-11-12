import { Card, Stack, TextField } from "@voyput/ui";
import { useSettings } from "./SettingsContext";
import type { ReasoningEffort } from "./settings";

export function SettingsPage() {
	const { settings, persisted, update } = useSettings();
	return (
		<Stack>
			<h1>Settings</h1>
			{persisted ? null : (
				<p role="alert">
					This browser refused to save settings. They will be lost when you
					close the tab.
				</p>
			)}
			<Card title="OpenRouter">
				<Stack>
					<TextField
						label="API key"
						type="password"
						value={settings.openRouterKey}
						onChange={(openRouterKey) => update({ openRouterKey })}
						description="Stored in this browser only. Requests go straight from here to OpenRouter."
					/>
					<TextField
						label="Model"
						value={settings.model}
						onChange={(model) => update({ model })}
						description="Any OpenRouter model that accepts images."
					/>
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
		</Stack>
	);
}
