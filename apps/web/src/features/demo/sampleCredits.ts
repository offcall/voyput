/** Source and licence of one sample page in `public/demo` (also in its CREDITS.md). */
export interface SampleCredit {
	files: string;
	title: string;
	url: string;
	author: string;
	license: string;
	licenseUrl: string;
	changes: string;
}

const COMMONS = "https://commons.wikimedia.org/wiki/File:";
const CC_BY_2 = {
	license: "CC BY 2.0",
	licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
};
const JON = { author: "Jon Rawlinson", ...CC_BY_2 };
const PAGE = (n: number) =>
	`cropped to page ${n}, scaled to 1400 px high, saved as JPEG`;

export const SAMPLE_CREDITS: SampleCredit[] = [
	{
		files: "sample-01.jpg",
		title: "Passport pages 6-7.jpg",
		url: `${COMMONS}Passport_pages_6-7.jpg`,
		author: "Jon Rawlinson",
		license: "Public domain",
		licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
		changes: PAGE(7),
	},
	{
		files: "sample-02.jpg",
		title: "Passport pages 8-9.jpg",
		url: `${COMMONS}Passport_pages_8-9.jpg`,
		...JON,
		changes: PAGE(9),
	},
	{
		files: "sample-03.jpg",
		title: "Passport stamps 18-19.jpg",
		url: `${COMMONS}Passport_stamps_18-19.jpg`,
		...JON,
		changes: `${PAGE(19)}; the visa sticker's serial number covered`,
	},
	{
		files: "sample-04.jpg",
		title: "Passport stamps 20-21.jpg",
		url: `${COMMONS}Passport_stamps_20-21.jpg`,
		...JON,
		changes: PAGE(21),
	},
	{
		files: "sample-05.jpg",
		title: "Passport pages 26-27.jpg",
		url: `${COMMONS}Passport_pages_26-27.jpg`,
		...JON,
		changes: `${PAGE(27)}; three handwritten numbers covered`,
	},
	{
		files: "sample-06.jpg",
		title: "Passport pages 28-29.jpg",
		url: `${COMMONS}Passport_pages_28-29.jpg`,
		...JON,
		changes: `${PAGE(29)}; the handwritten receipt number covered`,
	},
	{
		files: "sample-07.jpg",
		title: "Passport pages 30-31.jpg",
		url: `${COMMONS}Passport_pages_30-31.jpg`,
		...JON,
		changes: PAGE(31),
	},
	{
		files: "sample-08.jpg",
		title: "Passport pages 46-47.jpg",
		url: `${COMMONS}Passport_pages_46-47.jpg`,
		...JON,
		changes: `${PAGE(46)}; a number printed along the left edge covered`,
	},
	{
		files: "sample-09.jpg, sample-10.jpg",
		title: "CroatiaDutchGermanySloveniaUSpassportstamps.jpg",
		url: `${COMMONS}CroatiaDutchGermanySloveniaUSpassportstamps.jpg`,
		author: "Vish Seshadri",
		license: "CC BY-SA 3.0",
		licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
		changes:
			"split into page 6 and page 7, saved as JPEG; the crops are CC BY-SA 3.0 too",
	},
];
