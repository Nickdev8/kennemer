<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { devices } from '$lib/config/devices';
  import type { DeviceCommandKey, ShellyDevice } from '$lib/config/schema';
  import { fetchStatuses, triggerDeviceCommand, type StatusMap } from '$lib/api';

  let loadingCommandKey: string | null = null;
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

  const statusKeys = devices.filter((device) => device.status).map((device) => device.id);

  const commandOrder: DeviceCommandKey[] = ['on', 'off'];

  const commandKey = (deviceId: string, command: DeviceCommandKey) => `${deviceId}:${command}`;

  const deviceStatusKey = (device: ShellyDevice) => (device.status ? device.id : undefined);

  function getStatusEntry(key?: string) {
    if (!key) return null;
    return statuses[key] ?? null;
  }

  function statusHasIssue(key?: string) {
    const entry = getStatusEntry(key);
    if (!entry) return false;
    const value = typeof entry.value === 'string' ? entry.value.toLowerCase() : '';
    return Boolean(entry.error) || value === 'offline' || value === 'niet beschikbaar';
  }

  function startCooldown(key: string, durationMs = 1000) {
    const existingTimer = cooldownTimers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    const next = new Set(cooldown);
    next.add(key);
    cooldown = next;
    buttonMessages = { ...buttonMessages, [key]: 'wacht 1 seconden' };

    const timer = setTimeout(() => {
      cooldownTimers.delete(key);
      const updatedSet = new Set(cooldown);
      updatedSet.delete(key);
      cooldown = updatedSet;

      const nextMessages = { ...buttonMessages };
      delete nextMessages[key];
      buttonMessages = nextMessages;
    }, durationMs);

    cooldownTimers.set(key, timer);
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
      console.debug('[status] fetched', response);
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

  function commandLabel(device: ShellyDevice, command: DeviceCommandKey) {
    const config = device.commands[command];
    if (!config) return command === 'on' ? 'On' : 'Off';
    return config.label ?? (command === 'on' ? 'On' : 'Off');
  }

  async function handlePress(deviceId: string, command: DeviceCommandKey) {
    const key = commandKey(deviceId, command);
    loadingCommandKey = key;
    errorMsg = '';
    try {
      await triggerDeviceCommand(deviceId, command);
      handleSuccessfulAction();
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error?.code === 'RATE_LIMIT') {
        startCooldown(key);
        handleSuccessfulAction();
      } else {
        errorMsg = error instanceof Error ? error.message : 'Unknown error';
      }
    } finally {
      loadingCommandKey = null;
    }
  }

  const baseButtonClass =
    'relative flex min-h-[4.75rem] items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-5 py-6 text-xl font-semibold text-slate-800 transition-transform duration-150 ease-out enabled:hover:-translate-y-0.5 enabled:hover:bg-slate-200 enabled:hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60';

  function buttonClass(key: string) {
    const classes = [baseButtonClass];
    if (loadingCommandKey === key)
      classes.push('ring-2 ring-blue-200 ring-offset-2 ring-offset-slate-100');
    if (cooldown.has(key)) classes.push('opacity-50');
    return classes.join(' ');
  }

  function statusClass(key?: string) {
    if (!key) return 'text-slate-500';
    return statusHasIssue(key) ? 'text-red-600 font-semibold' : 'text-slate-600';
  }

  function statusLabel(key?: string) {
   if (!key) return '—';
    const entry = getStatusEntry(key);
    if (!entry) return '...';
    console.debug('[status] entry', key, entry);
    return entry.value;
  }

  function statusErrorMessage(key?: string) {
    const entry = getStatusEntry(key);
    return entry?.error ?? '';
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

  <div class="grid grid-cols-1 gap-6 pb-16 md:grid-cols-2 xl:grid-cols-3">
    {#each devices as device}
      <section class="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-xl font-semibold tracking-tight text-slate-800">{device.label}</h2>
          {#if device.status}
            <span class={`text-sm uppercase tracking-wide ${statusClass(deviceStatusKey(device))}`}>
              {statusLabel(deviceStatusKey(device))}
            </span>
          {/if}
        </div>
        {#if device.status && statusHasIssue(deviceStatusKey(device))}
          <p class="text-xs font-semibold text-red-600">
            {statusErrorMessage(deviceStatusKey(device)) || 'Apparaat offline'}
          </p>
        {/if}
        <div class="grid grid-cols-2 gap-2">
          {#each commandOrder as cmd}
            {#if device.commands[cmd]}
              {@const key = commandKey(device.id, cmd)}
              <button
                type="button"
                class={buttonClass(key)}
                on:click={() => handlePress(device.id, cmd)}
                disabled={cooldown.has(key)}
              >
                <span class="pointer-events-none text-center">{commandLabel(device, cmd)}</span>
                {#if buttonMessages[key]}
                  <span class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/60 text-sm font-semibold uppercase tracking-wide text-white">
                    {buttonMessages[key]}
                  </span>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
      </section>
    {/each}
  </div>

  <div class="pointer-events-none fixed bottom-6 right-6 flex justify-end">
    <button
      type="button"
      class="pointer-events-auto rounded-full border border-slate-300 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-200"
    >
      Advanced Users
    </button>
  </div>
</main>
