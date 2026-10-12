<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import TouchKeyboard from '$lib/components/touch-keyboard.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}
<TouchKeyboard />
