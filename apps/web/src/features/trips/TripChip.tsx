import { CountryChip } from "@voyput/ui";
import { colorOf } from "./format";

/** Kit country chip in the core country colour, as on Visualize. */
export function TripChip({ code }: { code: string }) {
	return <CountryChip code={code} colour={colorOf(code)} />;
}
