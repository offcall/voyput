import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../Button";
import { PixelArt } from "../pixel/PixelArt";
import { PixelSky } from "../pixel/PixelSky";
import { SPRITE_NAMES } from "../pixel/sprites";
import { TwinkleStars } from "../pixel/TwinkleStars";

const meta: Meta = { title: "Pixel art" };
export default meta;

export const Sprites: StoryObj = {
	render: () => (
		<div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
			{SPRITE_NAMES.map((name) => (
				<figure
					key={name}
					style={{ margin: 0, display: "grid", gap: 8, justifyItems: "center" }}
				>
					<PixelArt name={name} scale={5} title={name} />
					<figcaption style={{ fontSize: 12, color: "var(--vp-muted)" }}>
						{name}
					</figcaption>
				</figure>
			))}
		</div>
	),
};

export const Scales: StoryObj = {
	render: () => (
		<div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
			{[1, 2, 3, 4, 6, 8].map((scale) => (
				<PixelArt key={scale} name="passport" scale={scale} />
			))}
		</div>
	),
};

export const Twinkle: StoryObj = {
	render: () => (
		<div
			style={{
				position: "relative",
				height: 180,
				borderRadius: 14,
				background: "var(--vp-surface)",
				border: "1px solid var(--vp-border)",
			}}
		>
			<TwinkleStars count={28} />
		</div>
	),
};

export const SkyFollowsTheme: StoryObj = {
	render: () => (
		<PixelSky>
			<h2 className="vp-pixel" style={{ margin: 0, fontSize: 24 }}>
				Your travels
			</h2>
		</PixelSky>
	),
};

export const SkyDayAndNight: StoryObj = {
	render: () => (
		<div style={{ display: "grid", gap: 16 }}>
			<PixelSky time="day" height={140} />
			<PixelSky time="night" height={140}>
				<Button variant="primary">Load demo data</Button>
			</PixelSky>
		</div>
	),
};
