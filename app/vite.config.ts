import { execFileSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

function buildRevision() {
	const supplied = process.env.KENNEMER_BUILD_COMMIT;
	if (supplied && /^[a-f0-9]{40,64}$/.test(supplied)) return supplied;
	try {
		const revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
			cwd: fileURLToPath(new URL('..', import.meta.url)),
			timeout: 2000,
			stdio: ['ignore', 'pipe', 'ignore']
		})
			.toString()
			.trim();
		return /^[a-f0-9]{40,64}$/.test(revision) ? revision : null;
	} catch {
		return null;
	}
}

export default defineConfig({
	define: { __KENNEMER_BUILD_COMMIT__: JSON.stringify(buildRevision()) },
	plugins: [tailwindcss(), sveltekit()],
	server: {
		fs: {
			allow: [
				fileURLToPath(new URL('src', import.meta.url)),
				fileURLToPath(new URL('.svelte-kit', import.meta.url)),
				fileURLToPath(new URL('node_modules', import.meta.url)),
				fileURLToPath(new URL('config', import.meta.url))
			]
		}
	}
});
