declare global {
	const __KENNEMER_BUILD_COMMIT__: string | null;
	namespace App {}
}

export {};

declare module '@smui/button' {
	import type { SvelteComponentTyped } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface ButtonProps extends HTMLAttributes<HTMLButtonElement> {
		variant?: 'text' | 'raised' | 'unelevated' | 'outlined';
		color?: string;
	}

	export default class Button extends SvelteComponentTyped<ButtonProps> {}
}
