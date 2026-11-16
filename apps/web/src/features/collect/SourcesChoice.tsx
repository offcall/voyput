import { PixelArt, type SpriteName } from "@voyput/ui";
import { useState } from "react";
import { useDb } from "../../db/DbContext";
import {
	SOURCE_LABELS,
	type Sources,
	saveSources,
} from "../import/plan/sources";

const OPTIONS: {
	value: Sources;
	sprites: SpriteName[];
	text: string;
}[] = [
	{
		value: "photos",
		sprites: ["globe"],
		text: "iPhone photo locations → stays by country. Two steps, no AI key.",
	},
	{
		value: "passport",
		sprites: ["passport"],
		text: "Photos of the stamp pages → AI reads the stamps → you check them → stays.",
	},
	{
		value: "both",
		sprites: ["globe", "passport"],
		text: "The most precise: photo locations confirm the stamp dates.",
	},
];

/**
 * "What do you have?": photos only, passport only or both. The choice is stored
 * and decides which Collect steps show (ADR 0024). A quiet text link loads the demo; the main path is your own data and key.
 */
export function SourcesChoice({
	current,
	onChosen,
	onDemo,
	demoBusy = false,
}: {
	current: Sources | null;
	onChosen: (sources: Sources) => void;
	onDemo: () => void;
	demoBusy?: boolean;
}) {
	const db = useDb();
	const [error, setError] = useState<string | null>(null);
	const choose = (sources: Sources) => {
		setError(null);
		saveSources(db, sources).then(
			() => onChosen(sources),
			(failure: unknown) =>
				setError(
					`Could not save the choice: ${failure instanceof Error ? failure.message : String(failure)}`,
				),
		);
	};
	return (
		<div className="collect-sources">
			<ul className="collect-sources-options">
				{OPTIONS.map((option) => (
					<li key={option.value}>
						<button
							type="button"
							className="collect-source"
							aria-pressed={current === option.value}
							onClick={() => choose(option.value)}
						>
							<span className="collect-source-art" aria-hidden="true">
								{option.sprites.map((sprite) => (
									<PixelArt key={sprite} name={sprite} scale={3} />
								))}
							</span>
							<span className="collect-source-name">
								{SOURCE_LABELS[option.value]}
							</span>
							<span className="collect-source-text">{option.text}</span>
						</button>
					</li>
				))}
			</ul>
			{error ? (
				<p role="alert" className="collect-sources-error">
					{error}
				</p>
			) : null}
			<p className="collect-sources-demo">
				No passport at hand?{" "}
				<button
					type="button"
					className="collect-link"
					onClick={onDemo}
					disabled={demoBusy}
				>
					{demoBusy ? "Loading demo data…" : "Try with demo data"}
				</button>
				<span className="collect-muted">
					{" "}
					· marked as demo and removed with one button
				</span>
			</p>
		</div>
	);
}
