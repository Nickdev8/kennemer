import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

/** Load pure configuration/server modules for local checks without booting SvelteKit. */
export function createModuleLoader() {
	const root = fileURLToPath(new URL('..', import.meta.url));
	return createServer({
		root,
		configFile: false,
		appType: 'custom',
		optimizeDeps: { noDiscovery: true, include: [] },
		resolve: { alias: { $lib: `${root}/src/lib` } },
		server: { middlewareMode: true, hmr: false, ws: false, watch: null },
		plugins: [
			{
				name: 'check-environment',
				resolveId(id) {
					if (id === '$env/dynamic/private') return '\0check-env';
				},
				load(id) {
					if (id === '\0check-env') return 'export const env = process.env;';
				}
			}
		]
	});
}
