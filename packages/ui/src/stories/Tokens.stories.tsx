import type { Meta, StoryObj } from "@storybook/react-vite";

const meta: Meta = { title: "Tokens" };
export default meta;

const swatch = (name: string) => (
	<div key={name} style={{ display: "grid", gap: 4, fontSize: 11 }}>
		<div
			style={{
				width: 72,
				height: 40,
				borderRadius: "var(--vp-radius-sm)",
				border: "1px solid var(--vp-border)",
				background: `var(${name})`,
			}}
		/>
		<code>{name}</code>
	</div>
);

const row = (names: string[]) => (
	<div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
		{names.map(swatch)}
	</div>
);

export const Colours: StoryObj = {
	render: () => (
		<div style={{ display: "grid", gap: 20 }}>
			{row([
				"--vp-bg",
				"--vp-surface",
				"--vp-surface-2",
				"--vp-surface-3",
				"--vp-border",
				"--vp-border-strong",
				"--vp-text",
				"--vp-muted",
				"--vp-muted-2",
			])}
			{row([
				"--vp-accent",
				"--vp-accent-soft",
				"--vp-accent-ink",
				"--vp-good",
				"--vp-good-soft",
				"--vp-warn",
				"--vp-warn-soft",
				"--vp-bad",
				"--vp-bad-soft",
				"--vp-info",
				"--vp-info-soft",
			])}
			{row(Array.from({ length: 10 }, (_, i) => `--vp-cat-${i + 1}`))}
		</div>
	),
};

export const Type: StoryObj = {
	render: () => (
		<div style={{ display: "grid", gap: 8 }}>
			{["2xl", "xl", "lg", "md", "sm", "xs"].map((size) => (
				<div key={size} style={{ fontSize: `var(--vp-text-${size})` }}>
					--vp-text-{size}: Passport stamps, 2016-08-10
				</div>
			))}
		</div>
	),
};
