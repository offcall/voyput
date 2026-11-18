/** SHA-256 (hex) of each script the site serves, by file name (`apps/web/vite.config.ts`). */
declare module "virtual:script-hashes" {
	const hashes: Record<"voyput-local.mjs" | "photo-locations.sh", string>;
	export default hashes;
}
