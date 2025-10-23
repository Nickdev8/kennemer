// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
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
