import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Card } from "../Card";
import { CountryChip } from "../CountryChip";

/** Stand-in for core `countryColor`; the kit does not pick colours itself. */
const colours = [
	"#3b6fd8",
	"#e07b39",
	"#2a9a73",
	"#d4465c",
	"#8656d0",
	"#b8941c",
	"#1c98b8",
	"#cc4f97",
];

import { Disclosure } from "../Disclosure";
import { EmptyState } from "../EmptyState";
import { Notice } from "../Notice";
import { PageHeader } from "../PageHeader";
import { Stat, StatGroup } from "../Stat";
import { Toolbar, ToolbarSpacer } from "../Toolbar";

const meta: Meta = { title: "Layout" };
export default meta;

export const PageHeaderExample: StoryObj = {
	render: () => (
		<PageHeader
			eyebrow="Step 1 of 5"
			title="Import"
			description="Bring your passport photos and the location CSV."
			actions={<Button variant="primary">Add passport</Button>}
		/>
	),
};

export const PageHeaderStep4: StoryObj = {
	render: () => (
		<PageHeader
			eyebrow="Step 4 of 5"
			title="Trips"
			description="Trips built from your stamps and photos."
		/>
	),
};

export const CardVariants: StoryObj = {
	render: () => (
		<div
			style={{
				display: "grid",
				gap: 16,
				gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
			}}
		>
			<Card title="Default">
				<p>Plain card.</p>
			</Card>
			<Card variant="selected" title="Selected" description="Green border">
				<p>The chosen one in a list.</p>
			</Card>
			<Card
				variant="highlight"
				title="Highlight"
				description="Border, glow and a tint"
			>
				<p>Draws the eye to the next step.</p>
			</Card>
		</div>
	),
};

export const CardWithActions: StoryObj = {
	render: () => (
		<Card
			title="Demo passport"
			description="valid 2015-06-01 – 2025-05-31 · 5 photos"
			actions={
				<>
					<Button size="sm">Edit</Button>
					<Button size="sm" variant="danger">
						Delete
					</Button>
				</>
			}
		>
			<p>Card body.</p>
		</Card>
	),
};

export const ToolbarExample: StoryObj = {
	render: () => (
		<Toolbar>
			<Button size="sm">All</Button>
			<Button size="sm" variant="ghost">
				Problems
			</Button>
			<ToolbarSpacer />
			<Badge tone="accent">16 stamps</Badge>
		</Toolbar>
	),
};

export const EmptyStateExample: StoryObj = {
	render: () => (
		<EmptyState
			icon="✈"
			title="No trips yet"
			action={<Button variant="primary">Build trips</Button>}
		>
			Review your stamps first; trips are built from them and your photos.
		</EmptyState>
	),
};

export const EmptyStateSecondary: StoryObj = {
	render: () => (
		<EmptyState
			icon="✈"
			title="No trips yet"
			action={<Button variant="secondary">Build trips</Button>}
		>
			Review your stamps first; trips are built from them and your photos.
		</EmptyState>
	),
};

export const Stats: StoryObj = {
	render: () => (
		<StatGroup>
			<Stat label="Locations" value="2 467" />
			<Stat label="Period" value="2015 – 2025" hint="10 years" />
			<Stat label="Countries" value="12" />
			<Stat label="Cities" value="31" />
		</StatGroup>
	),
};

export const CountryChips: StoryObj = {
	render: () => (
		<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
			{(
				[
					["UA", "Ukraine"],
					["ES", "Spain"],
					["MD", "Moldova"],
					["RO", "Romania"],
					["TR", "Türkiye"],
					["GE", "Georgia"],
					["DE", "Germany"],
					["PL", "Poland"],
				] as const
			).map(([code, name], index) => (
				<CountryChip
					key={code}
					code={code}
					name={name}
					colour={colours[index]}
				/>
			))}
			<CountryChip code="XK" />
		</div>
	),
};

export const DisclosureExample: StoryObj = {
	render: () => (
		<Disclosure summary="How to get this file">
			<ol>
				<li>Give your terminal Full Disk Access.</li>
				<li>Export the Photos library with osxphotos.</li>
			</ol>
		</Disclosure>
	),
};

export const Notices: StoryObj = {
	render: () => (
		<div style={{ display: "grid", gap: 8 }}>
			<Notice>Importing…</Notice>
			<Notice tone="good">Imported 2 467 locations.</Notice>
			<Notice tone="warn">12 rows skipped.</Notice>
			<Notice tone="bad">The file has no valid rows.</Notice>
		</div>
	),
};
