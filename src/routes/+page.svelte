<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { actions } from '$lib/config/devices';
  import { triggerAction } from '$lib/api';

  let loadingId: string | null = null;
  let errorMsg = '';
  let cooldown = new Set<string>();
  let buttonMessages: Record<string, string> = {};

  const cooldownTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const groupedActions = Array.from(
    actions.reduce((acc, action) => {
      const groupName = action.group ?? 'Other';
      if (!acc.has(groupName)) acc.set(groupName, []);
      acc.get(groupName)!.push(action);
      return acc;
    }, new Map<string, typeof actions[number][]>())
  ).map(([name, items]) => ({ name, items }));

  function startCooldown(id: string, durationMs = 1000) {
    const existingTimer = cooldownTimers.get(id);
    if (existingTimer) clearTimeout(existingTimer);

    const next = new Set(cooldown);
    next.add(id);
    cooldown = next;
    buttonMessages = { ...buttonMessages, [id]: 'wacht 1 seconden' };

    const timer = setTimeout(() => {
      cooldownTimers.delete(id);
      const updatedSet = new Set(cooldown);
      updatedSet.delete(id);
      cooldown = updatedSet;

      const nextMessages = { ...buttonMessages };
      delete nextMessages[id];
      buttonMessages = nextMessages;
    }, durationMs);

    cooldownTimers.set(id, timer);
  }

  async function handlePress(id: string) {
    loadingId = id;
    errorMsg = '';
    try {
      await triggerAction(id);
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error?.code === 'RATE_LIMIT') {
        startCooldown(id);
      } else {
        errorMsg = error instanceof Error ? error.message : 'Unknown error';
      }
    } finally {
      loadingId = null;
    }
  }

  const baseButtonClass =
    'relative flex min-h-[6rem] items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-6 py-8 text-2xl font-semibold text-slate-800 transition-transform duration-150 ease-out enabled:hover:-translate-y-0.5 enabled:hover:bg-slate-200 enabled:hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60';

  function buttonClass(id: string) {
    const classes = [baseButtonClass];
    if (loadingId === id) classes.push('ring-2 ring-blue-200 ring-offset-2 ring-offset-slate-100');
    if (cooldown.has(id)) classes.push('opacity-50');
    return classes.join(' ');
  }

  onMount(() => window.addEventListener('contextmenu', (evt) => evt.preventDefault()));
  onDestroy(() => {
    cooldownTimers.forEach((timer) => clearTimeout(timer));
    cooldownTimers.clear();
  });
</script>

<main class="flex min-h-screen flex-col gap-8 bg-slate-100 p-6 sm:p-8">
  {#if errorMsg}
    <p class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700 shadow-sm">
      {errorMsg}
    </p>
  {/if}

  <div class="grid flex-1 grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
    {#each groupedActions as group}
      <section class="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm">
        <header>
          <h2 class="text-xl font-semibold tracking-tight text-slate-800">{group.name}</h2>
        </header>
        <div class="flex flex-col gap-3">
          {#each group.items as action}
            <button
              type="button"
              class={buttonClass(action.id)}
              on:click={() => handlePress(action.id)}
              disabled={loadingId !== null || cooldown.has(action.id)}
            >
              <span class="pointer-events-none text-center">{action.label}</span>
              {#if buttonMessages[action.id]}
                <span class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/60 text-sm font-semibold uppercase tracking-wide text-white">
                  {buttonMessages[action.id]}
                </span>
              {/if}
            </button>
          {/each}
        </div>
      </section>
    {/each}
  </div>

  <div class="flex justify-end">
    <button
      type="button"
      class="rounded-full border border-slate-300 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-200"
    >
      Advanced Users
    </button>
  </div>
</main>
