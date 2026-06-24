import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
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
