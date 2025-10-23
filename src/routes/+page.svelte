<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { actions } from '$lib/config/devices';
  import { triggerAction } from '$lib/api';

  let loadingId: string | null = null;
  let errorMsg = '';

  async function handlePress(id: string) {
    loadingId = id;
    errorMsg = '';
    try {
      await triggerAction(id);
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      loadingId = null;
    }
  }

  onMount(() => window.addEventListener('contextmenu', (evt) => evt.preventDefault()));
</script>

<div class="grid">
  {#if errorMsg}
    <p class="error">{errorMsg}</p>
  {/if}

  {#each actions as action}
    <button
      class:busy={loadingId === action.id}
      on:click={() => handlePress(action.id)}
      disabled={loadingId !== null}
    >
      <span class="label">{action.label}</span>
    </button>
  {/each}
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
  button { font-size: 1.5rem; padding: 2rem; }
  .busy { opacity: 0.6; }
  .error { color: #c0392b; font-weight: bold; }
</style>
