/** SVG drawing of fictional passport visa pages and border stamps. */

import {
	COUNTRIES,
	PAGE_HEIGHT,
	PAGE_WIDTH,
	type PagePlan,
	type StampPlan,
} from "./scenario.ts";

const MONTHS = [
	"JAN",
	"FEB",
	"MAR",
	"APR",
	"MAY",
	"JUN",
	"JUL",
	"AUG",
	"SEP",
	"OCT",
	"NOV",
	"DEC",
];

function dateParts(date: string): { dd: string; mm: string; yy: string } {
	const [yyyy = "", mm = "", dd = ""] = date.split("-");
	return { dd, mm, yy: yyyy.slice(2) };
}

/** The date line exactly as the stamp prints it. */
export function dateText(stamp: StampPlan): string {
	const { dd, mm, yy } = dateParts(stamp.date);
	switch (stamp.style) {
		case "schengen":
			return `${dd}.${mm}.${yy} ${stamp.officer}`;
		case "ukraine":
			return `${stamp.direction === "entry" ? "▷" : "◁"} ${dd} ${mm} ${yy} ${stamp.officer}`;
		case "generic":
			return `${dd} ${MONTHS[Number(mm) - 1]} ${stamp.date.slice(0, 4)}`;
	}
}

function escapeXml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

const FONT = `font-family="DejaVu Sans, Arial, sans-serif"`;
const MONO = `font-family="DejaVu Sans Mono, Courier New, monospace"`;

function starCircle(cx: number, cy: number, letter: string, ink: string) {
	const stars: string[] = [];
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		const x = cx + Math.cos(a) * 30;
		const y = cy + Math.sin(a) * 30;
		stars.push(
			`<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="11" text-anchor="middle" fill="${ink}" ${FONT}>★</text>`,
		);
	}
	return `${stars.join("")}<text x="${cx}" y="${cy + 8}" font-size="22" font-weight="bold" text-anchor="middle" fill="${ink}" ${FONT}>${letter}</text>`;
}

/** Small box with an arrow pointing into it (entry) or out of it (exit). */
function arrowBox(x: number, y: number, entry: boolean, ink: string) {
	const box = entry
		? `<rect x="${x + 22}" y="${y}" width="30" height="26" fill="none" stroke="${ink}" stroke-width="2.5"/>`
		: `<rect x="${x}" y="${y}" width="30" height="26" rx="8" fill="none" stroke="${ink}" stroke-width="2.5"/>`;
	const arrow = entry
		? `<path d="M ${x} ${y + 13} H ${x + 40} M ${x + 32} ${y + 6} L ${x + 41} ${y + 13} L ${x + 32} ${y + 20}" fill="none" stroke="${ink}" stroke-width="3"/>`
		: `<path d="M ${x + 12} ${y + 13} H ${x + 52} M ${x + 44} ${y + 6} L ${x + 53} ${y + 13} L ${x + 44} ${y + 20}" fill="none" stroke="${ink}" stroke-width="3"/>`;
	return box + arrow;
}

function transportIcon(x: number, y: number, stamp: StampPlan, ink: string) {
	if (stamp.crossing === "plane") {
		return `<text x="${x}" y="${y}" font-size="30" text-anchor="middle" fill="${ink}" ${FONT}>✈</text>`;
	}
	// Simple car: body, cabin, two wheels.
	return `<g fill="none" stroke="${ink}" stroke-width="2.5"><rect x="${x - 20}" y="${y - 16}" width="40" height="12" rx="3"/><path d="M ${x - 11} ${y - 16} L ${x - 6} ${y - 25} H ${x + 7} L ${x + 12} ${y - 16}"/><circle cx="${x - 11}" cy="${y - 2}" r="4"/><circle cx="${x + 11}" cy="${y - 2}" r="4"/></g>`;
}

function schengenStamp(stamp: StampPlan): string {
	const ink = "#1d2a5c";
	const letter = COUNTRIES[stamp.country]?.schengenLetter ?? "?";
	const entry = stamp.direction === "entry";
	const frame = `<rect x="-150" y="-100" width="300" height="200" rx="${entry ? 0 : 26}" fill="none" stroke="${ink}" stroke-width="4"/>`;
	return [
		frame,
		starCircle(-95, -45, letter, ink),
		transportIcon(10, -32, stamp, ink),
		arrowBox(68, -62, entry, ink),
		`<text x="0" y="30" font-size="34" font-weight="bold" text-anchor="middle" fill="${ink}" ${MONO}>${escapeXml(dateText(stamp))}</text>`,
		`<text x="0" y="72" font-size="20" text-anchor="middle" fill="${ink}" ${MONO}>${escapeXml(stamp.checkpoint)}</text>`,
	].join("");
}

function ukraineStamp(stamp: StampPlan): string {
	const ink = "#c8501e";
	return [
		`<rect x="-150" y="-85" width="300" height="170" rx="6" fill="none" stroke="${ink}" stroke-width="4"/>`,
		`<text x="0" y="-48" font-size="26" font-weight="bold" text-anchor="middle" fill="${ink}" ${FONT}>УКРАЇНА</text>`,
		`<text x="0" y="5" font-size="32" font-weight="bold" text-anchor="middle" fill="${ink}" ${MONO}>${escapeXml(dateText(stamp))}</text>`,
		`<text x="0" y="55" font-size="20" text-anchor="middle" fill="${ink}" ${FONT}>${escapeXml(stamp.checkpoint)}</text>`,
		`<text x="-136" y="-20" font-size="16" fill="${ink}" ${MONO} transform="rotate(-90 -136 -20)">${stamp.officer}</text>`,
		`<text x="136" y="20" font-size="16" fill="${ink}" ${MONO} transform="rotate(90 136 20)">${stamp.officer}</text>`,
	].join("");
}

function genericStamp(stamp: StampPlan): string {
	const ink = "#5a2a7a";
	const country = COUNTRIES[stamp.country]?.name.toUpperCase() ?? "";
	const word = stamp.direction === "entry" ? "ARRIVED" : "DEPARTED";
	return [
		`<rect x="-140" y="-90" width="280" height="180" rx="14" fill="none" stroke="${ink}" stroke-width="4"/>`,
		`<rect x="-130" y="-80" width="260" height="160" rx="10" fill="none" stroke="${ink}" stroke-width="1.5"/>`,
		`<text x="0" y="-45" font-size="19" font-weight="bold" text-anchor="middle" fill="${ink}" ${FONT}>${country} · ${word}</text>`,
		transportIcon(0, -5, stamp, ink),
		`<text x="0" y="35" font-size="30" font-weight="bold" text-anchor="middle" fill="${ink}" ${MONO}>${escapeXml(dateText(stamp))}</text>`,
		`<text x="0" y="65" font-size="17" text-anchor="middle" fill="${ink}" ${FONT}>${escapeXml(stamp.checkpoint)} · ${stamp.officer}</text>`,
	].join("");
}

function stampSvg(stamp: StampPlan): string {
	const body =
		stamp.style === "schengen"
			? schengenStamp(stamp)
			: stamp.style === "ukraine"
				? ukraineStamp(stamp)
				: genericStamp(stamp);
	return `<g transform="translate(${stamp.x} ${stamp.y}) rotate(${stamp.rotate})" opacity="0.82">${body}</g>`;
}

function background(pageNumber: number): string {
	const lines: string[] = [];
	for (let y = 40; y < PAGE_HEIGHT; y += 26) {
		lines.push(
			`<path d="M 0 ${y} Q ${PAGE_WIDTH / 4} ${y - 14} ${PAGE_WIDTH / 2} ${y} T ${PAGE_WIDTH} ${y}" fill="none" stroke="#c9dccf" stroke-width="1"/>`,
		);
	}
	return [
		`<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="#eef4ec"/>`,
		...lines,
		`<text x="${PAGE_WIDTH / 2}" y="90" font-size="40" letter-spacing="12" text-anchor="middle" fill="#8aa596" ${FONT}>VISAS</text>`,
		`<text x="${PAGE_WIDTH / 2}" y="${PAGE_HEIGHT / 2}" font-size="300" font-weight="bold" text-anchor="middle" fill="#d24a4a" opacity="0.13" transform="rotate(-35 ${PAGE_WIDTH / 2} ${PAGE_HEIGHT / 2})" ${FONT}>DEMO</text>`,
		`<text x="${PAGE_WIDTH / 2}" y="${PAGE_HEIGHT - 50}" font-size="28" text-anchor="middle" fill="#8aa596" ${FONT}>${pageNumber}</text>`,
		`<text x="40" y="${PAGE_HEIGHT - 100}" font-size="18" fill="#b04040" ${FONT}>SPECIMEN · FICTIONAL DEMO DATA · NOT A TRAVEL DOCUMENT</text>`,
	].join("");
}

export function pageSvg(page: PagePlan, pageNumber: number): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">${background(pageNumber)}${page.stamps.map(stampSvg).join("")}</svg>`;
}
