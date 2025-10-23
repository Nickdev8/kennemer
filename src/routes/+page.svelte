<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { actions } from '$lib/config/devices';
  import { fetchStatuses, triggerAction, type StatusMap } from '$lib/api';

  let loadingId: string | null = null;
  let errorMsg = '';
  let cooldown = new Set<string>();
  let buttonMessages: Record<string, string> = {};
  let statuses: StatusMap = {};

  const BASE_POLL_INTERVAL = 5000;
  const FAST_POLL_INTERVAL = 1000;
  const FAST_POLL_DURATION = 6000;

  const cooldownTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let pollTimeout: ReturnType<typeof setTimeout> | null = null;
  let fastPollUntil = 0;
  let polling = false;
  let shouldPollAgain = false;

  const statusKeys = Array.from(
    new Set(actions.map((action) => action.statusKey).filter(Boolean) as string[])
  );

  const groupedActions = Array.from(
    actions.reduce((acc, action) => {
      const groupName = action.group ?? 'Other';
      if (!acc.has(groupName)) acc.set(groupName, []);
      acc.get(groupName)!.push(action);
      return acc;
    }, new Map<string, typeof actions[number][]>())
  ).map(([name, items]) => ({
    name,
    items,
    statusKey: items.find((item) => item.statusKey)?.statusKey
  }));

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

  function scheduleNextPoll() {
    if (statusKeys.length === 0) return;
    if (pollTimeout) clearTimeout(pollTimeout);

    const delay = Date.now() < fastPollUntil ? FAST_POLL_INTERVAL : BASE_POLL_INTERVAL;
    pollTimeout = setTimeout(() => {
      pollStatuses();
    }, delay);
  }

  async function pollStatuses(immediate = false) {
    if (statusKeys.length === 0) return;

    if (polling) {
      if (immediate) shouldPollAgain = true;
      return;
    }

    if (immediate && pollTimeout) {
      clearTimeout(pollTimeout);
      pollTimeout = null;
    }

    polling = true;
    try {
      const response = await fetchStatuses(statusKeys);
      statuses = response;
    } catch (err) {
      console.error('Kon status niet ophalen', err);
    } finally {
      polling = false;
      if (shouldPollAgain) {
        shouldPollAgain = false;
        pollStatuses();
        return;
      }
      scheduleNextPoll();
    }
  }

  function handleSuccessfulAction() {
    fastPollUntil = Date.now() + FAST_POLL_DURATION;
    shouldPollAgain = true;
    pollStatuses(true);
  }

  async function handlePress(id: string) {
    loadingId = id;
    errorMsg = '';
    try {
      await triggerAction(id);
      handleSuccessfulAction();
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error?.code === 'RATE_LIMIT') {
        startCooldown(id);
        handleSuccessfulAction();
      } else {
        errorMsg = error instanceof Error ? error.message : 'Unknown error';
      }
    } finally {
      loadingId = null;
    }
  }

  const baseButtonClass =
    'relative flex min-h-[4.75rem] items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-5 py-6 text-xl font-semibold text-slate-800 transition-transform duration-150 ease-out enabled:hover:-translate-y-0.5 enabled:hover:bg-slate-200 enabled:hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60';

  function buttonClass(id: string) {
    const classes = [baseButtonClass];
    if (loadingId === id) classes.push('ring-2 ring-blue-200 ring-offset-2 ring-offset-slate-100');
    if (cooldown.has(id)) classes.push('opacity-50');
    return classes.join(' ');
  }

  function statusText(key?: string) {
    if (!key) return '—';
    const entry = statuses[key];
    if (!entry) return '...';
    if (entry.error) return 'Niet beschikbaar';
    return entry.value;
  }

  onMount(() => {
    window.addEventListener('contextmenu', (evt) => evt.preventDefault());
    pollStatuses(true);
  });

  onDestroy(() => {
    cooldownTimers.forEach((timer) => clearTimeout(timer));
    cooldownTimers.clear();
    if (pollTimeout) clearTimeout(pollTimeout);
  });
</script>

<main class="min-h-screen bg-slate-100 p-6 sm:p-8 space-y-8">
  {#if errorMsg}
    <p class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700 shadow-sm">
      {errorMsg}
    </p>
  {/if}

  <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
    {#each groupedActions as group}
      <section class="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
        <header class="flex items-center justify-between">
          <h2 class="text-xl font-semibold tracking-tight text-slate-800">{group.name}</h2>
          {#if group.statusKey}
            <span class="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {statusText(group.statusKey)}
            </span>
          {/if}
        </header>
        <div class="flex flex-col gap-2">
          {#each group.items as action}
            <button
              type="button"
              class={buttonClass(action.id)}
              on:click={() => handlePress(action.id)}
              disabled={cooldown.has(action.id)}
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
