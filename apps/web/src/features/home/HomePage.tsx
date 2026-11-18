import { Link, useNavigate } from "@tanstack/react-router";
import {
	Button,
	Card,
	CommandBox,
	Dialog,
	PixelArt,
	PixelSky,
	type SpriteName,
} from "@voyput/ui";
import { useState } from "react";
import { localCommands } from "../../ai/local";
import type { Plan } from "../../data/plan/planProgress";
import { saveSources } from "../../data/plan/sources";
import { usePlan } from "../../data/plan/usePlan";
import { useDb } from "../../db/DbContext";
import { SourcesChoice } from "../collect/SourcesChoice";
import { nextAction } from "../collect/steps";
import { DemoActionsProvider, useDemoActions } from "../demo/DemoActions";
import { DemoLoadedProvider } from "../import/demoLoaded";
import { plural } from "../trips/format";
import { deleteEverything } from "./deleteEverything";
import "../collect/collect.css";
import "./home.css";

/** Where the source code lives. The one constant to change if the repository moves. */
export const SOURCE_URL = "https://github.com/offcall/voyput";

/**
 * Who reads the stamps. Each entry is one line in Privacy; a local engine is one
 * more entry here.
 */
const STAMP_READERS: { name: string; text: string }[] = [
	{
		name: "OpenRouter",
		text: "only once you add your own key in Settings. Then each page image is sent from this browser straight to OpenRouter and the provider of the model you pick; voyput has no server in between.",
	},
	{
		name: "Local",
		text: "only if you run voyput-local on your own computer and pair it in Settings. Then each page image goes, encrypted, from this browser to that script, which passes it to your own Claude Code or Codex CLI; the CLI sends it to Anthropic or OpenAI under your account.",
	},
];

const STEPS: { sprites: SpriteName[]; title: string; text: string }[] = [
	{
		sprites: ["passport", "globe"],
		title: "Add your sources",
		text: "Photos of your passport's stamp pages, the photo locations of your iPhone, or both.",
	},
	{
		sprites: ["stamp"],
		title: "Check the stamps",
		text: "An AI reads country, date and direction; you confirm each one against the page and your photo locations.",
	},
	{
		sprites: ["suitcase", "trophy"],
		title: "Get your stays",
		text: "One-country stays by year, then a map, a calendar, your journey replayed and stats.",
	},
];

/**
 * `/`: what voyput is, how it works, what happens to the data, and where to start
 * (ADR 0025). A returning user gets a "Continue" to the next Collect step on top.
 */
export function HomePage() {
	return (
		<DemoLoadedProvider>
			<DemoActionsProvider>
				<HomeContent />
			</DemoActionsProvider>
		</DemoLoadedProvider>
	);
}

function HomeContent() {
	const plan = usePlan();
	return (
		<div className="home">
			<Hero />
			{plan?.hasData ? <Continue plan={plan} /> : null}
			<HowItWorks />
			<OwnKey />
			<Start plan={plan} />
			<Privacy />
		</div>
	);
}

function Hero() {
	return (
		<PixelSky height={300}>
			<div className="home-hero">
				<div className="home-hero-art" aria-hidden="true">
					<PixelArt name="passport" scale={4} />
					<PixelArt name="plane" scale={4} />
					<PixelArt name="globe" scale={4} />
				</div>
				<h1 className="home-title">
					Your travel history from passport stamps and iPhone photo locations
				</h1>
				<p className="home-promise">
					<PixelArt name="star" scale={2} />
					<span>
						<strong>
							Bring your own key. Your data stays in your browser.
						</strong>{" "}
						<span className="home-promise-note">
							Stamps are read by the AI you choose: OpenRouter with your key, or
							your Claude Code / Codex subscription on this computer. Only then
							are page images sent, straight to that AI.
						</span>
					</span>
				</p>
			</div>
		</PixelSky>
	);
}

/** The next action from the Collect plan, as the page's main button. */
function continueTarget(plan: Plan) {
	if (!plan.next)
		return { label: "See your insights", to: "/insights" as const };
	return {
		label: nextAction(plan.next.id, plan),
		to: "/collect/$step" as const,
		step: plan.next.id,
	};
}

function Continue({ plan }: { plan: Plan }) {
	const target = continueTarget(plan);
	return (
		<Card variant="highlight" className="home-continue" title="Welcome back">
			<p className="home-summary">
				{plural(plan.countries, "country", "countries")} ·{" "}
				{plural(plan.stays, "stay")}
			</p>
			<div className="home-actions">
				{target.to === "/insights" ? (
					<Link to="/insights" className="vp-button" data-variant="primary">
						Continue → {target.label}
					</Link>
				) : (
					<Link
						to="/collect/$step"
						params={{ step: target.step }}
						className="vp-button"
						data-variant="primary"
					>
						Continue → {target.label}
					</Link>
				)}
				<Link to="/collect/$step" params={{ step: "trips" }}>
					Stays
				</Link>
				<Link to="/insights">Insights</Link>
			</div>
		</Card>
	);
}

function HowItWorks() {
	return (
		<section className="home-section" aria-labelledby="home-how">
			<h2 id="home-how" className="home-heading">
				How it works
			</h2>
			<ol className="home-steps">
				{STEPS.map((step, index) => (
					<li key={step.title} className="home-step">
						<span className="home-step-art" aria-hidden="true">
							{step.sprites.map((sprite) => (
								<PixelArt key={sprite} name={sprite} scale={3} />
							))}
						</span>
						<span className="home-step-title">
							{index + 1}. {step.title}
						</span>
						<span className="home-step-text">{step.text}</span>
					</li>
				))}
			</ol>
		</section>
	);
}

/** Bring your own key: the two ways to read stamps, and where to set them up. */
function OwnKey() {
	return (
		<section className="home-section" aria-labelledby="home-key">
			<h2 id="home-key" className="home-heading">
				Bring your own key
			</h2>
			<p className="collect-muted">
				voyput has no AI of its own and no account. Pick how stamps are read;
				photo locations need no AI at all.
			</p>
			<ul className="home-steps">
				<li className="home-step">
					<span className="home-step-art" aria-hidden="true">
						<PixelArt name="plane" scale={3} />
					</span>
					<span className="home-step-title">OpenRouter key</span>
					<span className="home-step-text">
						Paste your key in Settings. Default model Gemini 3.8 Flash, about
						$0.015 per page, billed by OpenRouter to you.
					</span>
				</li>
				<li className="home-step">
					<span className="home-step-art" aria-hidden="true">
						<PixelArt name="stamp" scale={3} />
					</span>
					<span className="home-step-title">Your subscription, locally</span>
					<span className="home-step-text">
						Run voyput-local on your computer and pair it in Settings; it reads
						stamps with the Claude Code or Codex CLI you already pay for.
					</span>
					<CommandBox
						command={localCommands(window.location.origin).download}
						label="Copy the voyput-local command"
					/>
				</li>
			</ul>
			<p>
				<Link to="/settings" className="vp-button" data-variant="primary">
					Set up your key →
				</Link>
			</p>
		</section>
	);
}

function Start({ plan }: { plan: Plan | undefined }) {
	const db = useDb();
	const navigate = useNavigate();
	const demo = useDemoActions();
	return (
		<section className="home-section" aria-labelledby="home-start">
			<h2 id="home-start" className="home-heading">
				What do you have?
			</h2>
			<p className="collect-muted">
				Start with one source and add the other later.
			</p>
			<SourcesChoice
				current={plan?.sources ?? null}
				onChosen={(sources) =>
					void navigate({
						to: "/collect/$step",
						params: { step: sources === "photos" ? "locations" : "passports" },
					})
				}
				demoBusy={demo.state.kind === "busy"}
				onDemo={async () => {
					await saveSources(db, "both");
					if (await demo.load())
						void navigate({ to: "/collect/$step", params: { step: "review" } });
				}}
			/>
			{demo.state.kind === "error" ? (
				<p role="alert" className="collect-sources-error">
					{demo.state.message}
				</p>
			) : null}
			<p className="home-source">
				Open source:{" "}
				<a href={SOURCE_URL} target="_blank" rel="noreferrer">
					read the code on GitHub
				</a>
			</p>
		</section>
	);
}

function Privacy() {
	return (
		<section className="home-section" aria-labelledby="home-privacy">
			<h2 id="home-privacy" className="home-heading">
				Privacy
			</h2>
			<ul className="home-facts">
				<li>
					<strong>Stored in this browser.</strong> Passports, page photos,
					stamps, photo locations and stays are kept in this browser's
					IndexedDB; settings, your key and the theme in its localStorage.
				</li>
				<li>
					<strong>No backend.</strong> voyput is static files: no account, no
					voyput server, nothing uploaded to voyput.
				</li>
				<li>
					<strong>No analytics, cookies or trackers.</strong> Fonts and pixel
					art ship with the app.
				</li>
				{STAMP_READERS.map((reader) => (
					<li key={reader.name}>
						<strong>Stamps are read by {reader.name}</strong> {reader.text}
					</li>
				))}
				<li>
					<strong>Other requests.</strong> Settings loads OpenRouter's public
					list of models (no key, none of your data); demo data loads from this
					site.
				</li>
			</ul>
			<DeleteEverything />
		</section>
	);
}

function DeleteEverything() {
	const db = useDb();
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const confirm = () => {
		setOpen(false);
		deleteEverything(db).then(
			() => setStatus("Everything stored in this browser was deleted."),
			(failure: unknown) =>
				setStatus(
					`Could not delete: ${failure instanceof Error ? failure.message : String(failure)}`,
				),
		);
	};
	return (
		<div className="home-delete">
			<Button variant="danger" onClick={() => setOpen(true)}>
				Delete everything
			</Button>
			{status ? <p role="status">{status}</p> : null}
			<Dialog
				open={open}
				onOpenChange={setOpen}
				title="Delete everything?"
				actions={
					<>
						<Button onClick={() => setOpen(false)}>Cancel</Button>
						<Button variant="danger" onClick={confirm}>
							Delete everything
						</Button>
					</>
				}
			>
				<p>
					Every passport, page photo, stamp, photo location and stay in this
					browser is deleted. This cannot be undone. Settings and your key stay.
				</p>
			</Dialog>
		</div>
	);
}
