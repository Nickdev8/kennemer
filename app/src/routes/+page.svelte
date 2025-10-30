<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import DeviceCard from '$lib/components/device-card.svelte';
  import { devices as primaryDevices } from '$lib/config/devices';
  import { advancedDevices } from '$lib/config/advanced-devices';
  import { env as publicEnv } from '$env/dynamic/public';
  import type { DeviceCommandKey, ShellyDevice } from '$lib/config/schema';
  import { triggerDeviceCommand } from '$lib/api';

  type WattageDeviceSummary = {
    deviceId: string;
    name: string;
    ip: string;
    channel: number | null;
    watts: number;
    output: boolean | null;
  };

  function readBooleanFlag(value: string | undefined) {
    if (!value) return false;
    const normalised = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalised);
  }

  const compactWattage = readBooleanFlag(publicEnv.PUBLIC_COMPACT_WATTAGE);
  const wattageDisabled = readBooleanFlag(publicEnv.PUBLIC_DISABLE_WATTAGE);

  const expectedAdvancedPin = (publicEnv.PUBLIC_ADVANCED_PIN ?? '').trim();
  const advancedPinConfigured = expectedAdvancedPin.length > 0;

  let loadingCommandKey: string | null = null;
  let errorMsg = '';
  let cooldown = new Set<string>();
  let buttonMessages: Record<string, string> = {};

  const wattageRoomId = 6;
  let wattageLabel = `Room ${wattageRoomId}`;
  let wattageTotal = 0;
  let wattageDevices: WattageDeviceSummary[] = [];
  let wattageError = '';
  let wattageLoading = false;
  let wattageUpdatedAt: number | null = null;
  let wattageTimer: ReturnType<typeof setInterval> | null = null;
  const WATTAGE_REFRESH_MS = 5000;

  const cooldownTimers = new Map<string, ReturnType<typeof setTimeout>>();

  let showAdvancedPrompt = false;
  let showAdvancedPanel = false;
  let advancedUnlocked = false;
  let advancedPinInput = '';
  let advancedAccessError = '';

  const commandOrder: DeviceCommandKey[] = ['on', 'off'];

  const commandKey = (deviceId: string, command: DeviceCommandKey) => `${deviceId}:${command}`;

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

  async function refreshWattage() {
    if (wattageDisabled) {
      wattageLabel = `Room ${wattageRoomId}`;
      wattageTotal = 0;
      wattageDevices = [];
      wattageUpdatedAt = null;
      wattageError = '';
      return;
    }
    if (wattageLoading) return;
    wattageLoading = true;
    wattageError = '';
    try {
      const res = await fetch(`/api/wattage/${wattageRoomId}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const message = typeof payload.message === 'string' ? payload.message : 'Kon vermogen niet ophalen';
        throw new Error(message);
      }

      const data = (await res.json()) as {
        ok: boolean;
        label: string;
        totalWatts: number;
        devices: WattageDeviceSummary[];
      };

      if (!data.ok) {
        throw new Error('Onverwachte wattage respons');
      }

      wattageLabel = data.label;
      wattageTotal = data.totalWatts ?? 0;
      wattageDevices = data.devices ?? [];
      wattageUpdatedAt = Date.now();
    } catch (error) {
      wattageError = error instanceof Error ? error.message : 'Kon vermogen niet ophalen';
      wattageDevices = [];
      wattageTotal = 0;
      wattageUpdatedAt = null;
    } finally {
      wattageLoading = false;
    }
  }

  function formatWatts(value: number) {
    return `${value.toFixed(1)} W`;
  }

  function formatDeviceState(device: WattageDeviceSummary) {
    if (device.output === true) return 'Aan';
    if (device.output === false) return 'Uit';
    return 'Onbekend';
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
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error?.code === 'RATE_LIMIT') {
        startCooldown(key);
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

  const preventContextMenu = (evt: Event) => evt.preventDefault();

  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('contextmenu', preventContextMenu);
      if (!wattageDisabled) {
        refreshWattage();
        wattageTimer = setInterval(() => {
          refreshWattage();
        }, WATTAGE_REFRESH_MS);
      }
    }
  });

  onDestroy(() => {
    cooldownTimers.forEach((timer) => clearTimeout(timer));
    cooldownTimers.clear();
    if (typeof window !== 'undefined') {
      window.removeEventListener('contextmenu', preventContextMenu);
    }
    if (wattageTimer) {
      clearInterval(wattageTimer);
      wattageTimer = null;
    }
  });
</script>

<main class="space-y-8 min-h-screen bg-slate-100 p-6 pb-32 sm:p-8">
  {#if !compactWattage && !wattageDisabled}
    <section class="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm">
      <header class="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h2 class="text-lg font-semibold tracking-tight text-slate-800">{wattageLabel}</h2>
          <p class="text-sm text-slate-500">
            {#if wattageLoading}
              Bezig met ophalen…
            {:else}
              Lokaal wattage via Shelly status endpoints.
            {/if}
          </p>
        </div>
        <div class="text-right">
          <p class="text-2xl font-bold tracking-tight text-slate-900">{formatWatts(wattageTotal)}</p>
          <p class="text-xs uppercase tracking-wide text-slate-400">
            {#if wattageUpdatedAt}
              Laatste update: {new Date(wattageUpdatedAt).toLocaleTimeString()}
            {:else}
              Nog geen data
            {/if}
          </p>
        </div>
      </header>

      {#if wattageError}
        <p class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          {wattageError}
        </p>
      {/if}

      {#if wattageDevices.length > 0}
        <ul class="mt-4 divide-y divide-slate-200">
          {#each wattageDevices as device}
            <li class="flex items-center justify-between py-2 text-sm text-slate-700">
              <div class="min-w-0">
                <p class="truncate font-medium">{device.name}</p>
                <p class="text-xs uppercase tracking-wide text-slate-400">{formatDeviceState(device)}</p>
              </div>
              <div class="text-right font-semibold text-slate-800">{formatWatts(device.watts ?? 0)}</div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-4 text-sm text-slate-500">Geen apparaten gevonden voor deze ruimte.</p>
      {/if}
    </section>
  {/if}

  {#if errorMsg && !compactWattage && !wattageDisabled}
    <p class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700 shadow-sm">
      {errorMsg}
    </p>
  {/if}

  <div class="grid grid-cols-1 gap-6 pb-16 md:grid-cols-2 xl:grid-cols-3">
    {#each primaryDevices as device}
      <DeviceCard
        {device}
        {commandOrder}
        {commandKey}
        {commandLabel}
        {loadingCommandKey}
        {cooldown}
        {buttonMessages}
        on:command={({ detail }) => handlePress(detail.deviceId, detail.command)}
      />
    {/each}
  </div>

  <div class={`pointer-events-none fixed ${compactWattage && !wattageDisabled ? 'bottom-24' : 'bottom-6'} right-6 flex justify-end`}>
    <button
      type="button"
      class="pointer-events-auto rounded-full border border-slate-300 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-200"
      on:click={openAdvancedAccess}
    >
      Advanced Users
    </button>
  </div>

  {#if compactWattage && !wattageDisabled}
    <div class="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-800 bg-slate-900/95 px-6 py-4 text-white shadow-xl sm:px-10">
      <div class="flex items-center justify-between gap-6">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">{wattageLabel}</p>
          {#if wattageUpdatedAt}
            <p class="text-[10px] uppercase tracking-wide text-slate-500">
              Laatste update: {new Date(wattageUpdatedAt).toLocaleTimeString()}
            </p>
          {/if}
        </div>
        <div class="text-right">
          {#if wattageError}
            <p class="text-sm font-semibold text-amber-300">{wattageError}</p>
          {:else if wattageLoading}
            <p class="text-sm font-semibold text-slate-300">Bezig met ophalen…</p>
          {:else}
            <p class="text-3xl font-bold tracking-tight">{formatWatts(wattageTotal)}</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}
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
                {commandOrder}
                {commandKey}
                {commandLabel}
                {loadingCommandKey}
                {cooldown}
                {buttonMessages}
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
