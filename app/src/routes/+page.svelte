<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import DeviceCard from '$lib/components/device-card.svelte';
  import { devices as primaryDevices } from '$lib/config/devices';
  import { advancedDevices } from '$lib/config/advanced-devices';
  import { env as publicEnv } from '$env/dynamic/public';
  import type { DeviceCommandKey, ShellyDevice } from '$lib/config/schema';
  import { fetchStatuses, triggerDeviceCommand, type StatusMap } from '$lib/api';

  const expectedAdvancedPin = (publicEnv.PUBLIC_ADVANCED_PIN ?? '').trim();
  const advancedPinConfigured = expectedAdvancedPin.length > 0;

  const primaryStatusKeys = primaryDevices.filter((device) => device.status).map((device) => device.id);
  const advancedStatusKeys = advancedDevices.filter((device) => device.status).map((device) => device.id);

  let loadingCommandKey: string | null = null;
  let errorMsg = '';
  let cooldown = new Set<string>();
  let buttonMessages: Record<string, string> = {};
  let statuses: StatusMap = {};

  const BASE_POLL_INTERVAL = 12000;
  const FAST_POLL_INTERVAL = 3000;
  const FAST_POLL_DURATION = 6000;

  const cooldownTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let pollTimeout: ReturnType<typeof setTimeout> | null = null;
  let fastPollUntil = 0;
  let polling = false;
  let shouldPollAgain = false;

  let showAdvancedPrompt = false;
  let showAdvancedPanel = false;
  let advancedUnlocked = false;
  let advancedPinInput = '';
  let advancedAccessError = '';

  const commandOrder: DeviceCommandKey[] = ['on', 'off'];

  const commandKey = (deviceId: string, command: DeviceCommandKey) => `${deviceId}:${command}`;

  const deviceStatusKey = (device: ShellyDevice) => (device.status ? device.id : undefined);

  function currentStatusKeys(): string[] {
    if (showAdvancedPanel && advancedUnlocked) {
      return Array.from(new Set([...primaryStatusKeys, ...advancedStatusKeys]));
    }
    return primaryStatusKeys;
  }

  function getStatusEntry(currentStatuses: StatusMap, key?: string) {
    if (!key) return null;
    return currentStatuses[key] ?? null;
  }

  function statusHasIssue(currentStatuses: StatusMap, key?: string) {
    const entry = getStatusEntry(currentStatuses, key);
    if (!entry) return false;
    const value = typeof entry.value === 'string' ? entry.value.toLowerCase() : '';
    return Boolean(entry.error) || value === 'offline' || value === 'niet beschikbaar';
  }

  function startCooldown(key: string, durationMs = 2000) {
    const existingTimer = cooldownTimers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    const next = new Set(cooldown);
    next.add(key);
    cooldown = next;
    buttonMessages = { ...buttonMessages, [key]: 'wacht 2 seconden' };

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
    if (currentStatusKeys().length === 0) return;
    if (pollTimeout) clearTimeout(pollTimeout);

    const delay = Date.now() < fastPollUntil ? FAST_POLL_INTERVAL : BASE_POLL_INTERVAL;
    pollTimeout = setTimeout(() => {
      pollStatuses();
    }, delay);
  }

  async function pollStatuses(immediate = false) {
    const keys = currentStatusKeys();
    if (keys.length === 0) return;

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
      const response = await fetchStatuses(keys);
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

  function openAdvancedAccess() {
    if (advancedUnlocked) {
      showAdvancedPanel = true;
      return;
    }
    advancedPinInput = '';
    advancedAccessError = '';
    showAdvancedPrompt = true;
  }

  function closeAdvancedPrompt() {
    showAdvancedPrompt = false;
    advancedPinInput = '';
    advancedAccessError = '';
  }

  function closeAdvancedPanel() {
    showAdvancedPanel = false;
  }

  function submitAdvancedPin() {
    const submitted = advancedPinInput.trim();
    if (!advancedPinConfigured) {
      advancedAccessError = 'Stel PUBLIC_ADVANCED_PIN in je .env bestand in.';
      return;
    }
    if (submitted === expectedAdvancedPin) {
      advancedUnlocked = true;
      showAdvancedPrompt = false;
      advancedPinInput = '';
      advancedAccessError = '';
      showAdvancedPanel = true;
    } else {
      advancedAccessError = 'Onjuiste pincode. Probeer het opnieuw.';
    }
  }

  function handleAdvancedSubmit(event: Event) {
    event.preventDefault();
    submitAdvancedPin();
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

  $: if (showAdvancedPanel && advancedUnlocked) {
    pollStatuses(true);
  }
</script>

<main class="space-y-8 min-h-screen bg-slate-100 p-6 sm:p-8">
  {#if errorMsg}
    <p class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700 shadow-sm">
      {errorMsg}
    </p>
  {/if}

  <div class="grid grid-cols-1 gap-6 pb-16 md:grid-cols-2 xl:grid-cols-3">
    {#each primaryDevices as device}
      <DeviceCard
        {device}
        {statuses}
        {commandOrder}
        {commandKey}
        {commandLabel}
        {loadingCommandKey}
        {cooldown}
        {buttonMessages}
        {getStatusEntry}
        {statusHasIssue}
        {deviceStatusKey}
        on:command={({ detail }) => handlePress(detail.deviceId, detail.command)}
      />
    {/each}
  </div>

  <div class="pointer-events-none fixed bottom-6 right-6 flex justify-end">
    <button
      type="button"
      class="pointer-events-auto rounded-full border border-slate-300 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-200"
      on:click={openAdvancedAccess}
    >
      Advanced Users
    </button>
  </div>
</main>

{#if showAdvancedPrompt}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
    <div class="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
      <div class="space-y-1">
        <h2 class="text-lg font-semibold text-slate-800">Pincode vereist</h2>
        <p class="text-sm text-slate-600">Voer de pincode voor geavanceerde bediening in.</p>
      </div>
      {#if !advancedPinConfigured}
        <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
          Stel PUBLIC_ADVANCED_PIN in je .env bestand in om toegang te krijgen.
        </p>
      {/if}
      {#if advancedAccessError}
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-red-700">
          {advancedAccessError}
        </p>
      {/if}
      <form class="space-y-4" on:submit={handleAdvancedSubmit}>
        <input
          type="password"
          class="w-full rounded-xl border border-slate-300 px-4 py-3 text-base tracking-wide text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          placeholder="Pincode"
          bind:value={advancedPinInput}
          disabled={!advancedPinConfigured}
          autocomplete="one-time-code"
        />
        <div class="flex items-center justify-between gap-3">
          <button
            type="button"
            class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            on:click={closeAdvancedPrompt}
          >
            Annuleren
          </button>
          <button
            type="submit"
            class="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold tracking-wide text-white transition-colors duration-150 ease-out hover:bg-slate-900 disabled:opacity-60"
            disabled={!advancedPinConfigured}
          >
            Ontgrendel
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if advancedUnlocked && showAdvancedPanel}
  <div class="fixed inset-0 z-40 flex flex-col bg-slate-900/80 px-4 py-6 sm:px-8">
    <div class="relative mx-auto flex w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-xl">
      <header class="flex flex-col gap-2 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-1">
          <h2 class="text-2xl font-semibold tracking-tight text-slate-900">Advanced Controls</h2>
          <p class="text-sm text-slate-600">Geavanceerde bedieningselementen voor gemachtigde gebruikers.</p>
        </div>
        <button
          type="button"
          class="self-start rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-200 sm:self-auto"
          on:click={closeAdvancedPanel}
        >
          Sluiten
        </button>
      </header>
      <div class="flex-1 overflow-y-auto px-6 py-6">
        {#if advancedDevices.length === 0}
          <p class="text-sm text-slate-600">
            Geen geavanceerde apparaten geconfigureerd in
            <code class="rounded bg-slate-100 px-2 py-0.5 text-xs">app/src/lib/config/advanced-devices.ts</code>.
          </p>
        {:else}
          <div class="grid grid-cols-1 gap-6 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {#each advancedDevices as device}
              <DeviceCard
                {device}
                {statuses}
                {commandOrder}
                {commandKey}
                {commandLabel}
                {loadingCommandKey}
                {cooldown}
                {buttonMessages}
                {getStatusEntry}
                {statusHasIssue}
                {deviceStatusKey}
                showGroup
                on:command={({ detail }) => handlePress(detail.deviceId, detail.command)}
              />
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
