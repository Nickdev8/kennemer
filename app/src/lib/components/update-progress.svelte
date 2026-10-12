<script lang="ts">
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	export let phase: string;
</script>

{#if phase === 'starting' || phase === 'running'}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900 px-8 text-white"
		role="status"
		aria-live="assertive"
	>
		<div class="flex flex-col items-center text-center">
			<RefreshCw class="h-20 w-20 animate-spin" aria-hidden="true" />
			<p class="mt-8 text-4xl font-semibold">Bezig met updaten</p>
			<p class="mt-3 text-xl text-slate-300">Even geduld. Het scherm start vanzelf opnieuw.</p>
		</div>
	</div>
{/if}
