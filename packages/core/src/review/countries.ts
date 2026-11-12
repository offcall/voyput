import { COUNTRY_CODES } from "../trips/countries";

/** English country name → ISO code for every assigned code plus XK (Kosovo). */
export const countryNamesToCodes = (): Map<string, string> => {
	const names = new Intl.DisplayNames(["en"], { type: "region" });
	const map = new Map<string, string>();
	for (const code of [...COUNTRY_CODES, "XK"]) {
		const name = names.of(code);
		if (name && name !== code) map.set(name, code);
	}
	return map;
};
