import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Card } from "../Card";
import { Dialog } from "../Dialog";
import { Dropzone } from "../Dropzone";
import { Progress } from "../Progress";
import { Tabs } from "../Tabs";
import { TextField } from "../TextField";

const meta: Meta = { title: "Controls" };
export default meta;

export const Buttons: StoryObj = {
	render: () => (
		<div style={{ display: "flex", gap: 8 }}>
			<Button>Default</Button>
			<Button variant="primary">Primary</Button>
			<Button variant="danger">Delete</Button>
			<Button disabled>Disabled</Button>
		</div>
	),
};

export const Badges: StoryObj = {
	render: () => (
		<div style={{ display: "flex", gap: 8 }}>
			<Badge>neutral</Badge>
			<Badge tone="good">reviewed</Badge>
			<Badge tone="warn">check</Badge>
			<Badge tone="bad">failed</Badge>
		</div>
	),
};

export const TextFields: StoryObj = {
	render: function Render() {
		const [value, setValue] = useState("");
		return (
			<Card title="Settings">
				<TextField
					label="OpenRouter key"
					type="password"
					value={value}
					onChange={setValue}
					description="Stored in this browser only."
				/>
			</Card>
		);
	},
};

export const ProgressBar: StoryObj = {
	render: () => <Progress value={40} label="Extracting" />,
};

export const TabsExample: StoryObj = {
	render: () => (
		<Tabs
			items={[
				{ value: "map", label: "Map", content: <p>Map panel</p> },
				{
					value: "calendar",
					label: "Calendar",
					content: <p>Calendar panel</p>,
				},
			]}
		/>
	),
};

export const DropzoneExample: StoryObj = {
	render: () => (
		<Dropzone
			accept=".csv"
			label="Drop photo_locations.csv or pick it"
			onFiles={(files) => console.log(files)}
		/>
	),
};

export const DialogExample: StoryObj = {
	render: function Render() {
		const [open, setOpen] = useState(false);
		return (
			<>
				<Button onClick={() => setOpen(true)}>Open</Button>
				<Dialog
					open={open}
					onOpenChange={setOpen}
					title="Delete passport?"
					actions={
						<>
							<Button onClick={() => setOpen(false)}>Cancel</Button>
							<Button variant="danger" onClick={() => setOpen(false)}>
								Delete
							</Button>
						</>
					}
				>
					<p>Its photos and stamps go too.</p>
				</Dialog>
			</>
		);
	},
};
