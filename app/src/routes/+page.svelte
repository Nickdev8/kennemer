<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import DeviceCard from '$lib/components/device-card.svelte';
  import { devices as primaryDevices } from '$lib/config/devices';
  import { advancedDevices } from '$lib/config/advanced-devices';
  import { env as publicEnv } from '$env/dynamic/public';
  import type { DeviceCommandKey, ShellyDevice } from '$lib/config/schema';
  import { triggerDeviceCommand } from '$lib/api';
  import type { PageData } from './$types';
import RefreshCw from 'lucide-svelte/icons/refresh-cw';

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

  const wattageDisabled = readBooleanFlag(publicEnv.PUBLIC_DISABLE_WATTAGE);

  const expectedAdvancedPattern = (
    publicEnv.PUBLIC_ADVANCED_PATTERN ??
    publicEnv.PUBLIC_ADVANCED_PIN ??
    ''
  )
    .replace(/[^0-9]/g, '')
    .trim();
  const advancedPatternConfigured = expectedAdvancedPattern.length > 0;
  const patternNodes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  export let data: PageData;

  let loadingCommandKey: string | null = null;
  let errorMsg = '';
  let deviceStates = new Map<string, DeviceCommandKey>(
    Object.entries(data?.deviceStates ?? {}) as [string, DeviceCommandKey][]
  );

  const primaryDeviceCount = primaryDevices.length;
  const advancedDeviceCount = advancedDevices.length;

  const wattageRoomId = -1;
  let wattageLabel = `Room ${wattageRoomId}`;
  let wattageTotal = 0;
  let wattageDevices: WattageDeviceSummary[] = [];
  let wattageError = '';
  let wattageLoading = false;
  let wattageUpdatedAt: number | null = null;
  let cacheMessage = '';
  let cacheClearing = false;

  let showAdvancedPrompt = false;
  let showAdvancedPanel = false;
  let advancedUnlocked = false;
  let advancedAccessError = '';
  let patternSequence: number[] = [];
  let patternActive = false;
  let patternStatus: 'idle' | 'success' | 'error' = 'idle';
  let activePointerId: number | null = null;

  const commandOrder: DeviceCommandKey[] = ['on', 'off'];

  const commandKey = (deviceId: string, command: DeviceCommandKey) => `${deviceId}:${command}`;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  async function refreshWattage(forceRefresh = false) {
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
      const endpoint = forceRefresh
        ? `/api/wattage/${wattageRoomId}?refresh=1`
        : `/api/wattage/${wattageRoomId}`;
      const res = await fetch(endpoint);
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

  async function handlePress(deviceId: string, command: DeviceCommandKey): Promise<void> {
    const key = commandKey(deviceId, command);
    loadingCommandKey = key;
    errorMsg = '';
    try {
      await triggerDeviceCommand(deviceId, command);
      setDeviceState(deviceId, command);
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error?.code === 'RATE_LIMIT') {
        await sleep(1000);
        return handlePress(deviceId, command);
      }
      errorMsg = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      loadingCommandKey = null;
    }
  }

  async function handleBulkCommand(command: DeviceCommandKey) {
    for (const device of primaryDevices) {
      await handlePress(device.id, command);
      await sleep(50);
    }
  }

  function setDeviceState(deviceId: string, command: DeviceCommandKey) {
    const next = new Map(deviceStates);
    next.set(deviceId, command);
    deviceStates = next;
  }

  async function loadDeviceStates() {
    try {
      const res = await fetch('/api/device-state', { cache: 'no-store' });
      if (!res.ok) return;
      const payload = (await res.json()) as {
        ok: boolean;
        states: Record<string, { lastCommand: DeviceCommandKey }>;
      };
      if (!payload?.ok || !payload.states) return;
      const next = new Map<string, DeviceCommandKey>();
      Object.entries(payload.states).forEach(([id, entry]) => {
        if (entry?.lastCommand) {
          next.set(id, entry.lastCommand);
        }
      });
      deviceStates = next;
    } catch {
      // ignore
    }
  }

  function openAdvancedAccess() {
    cacheMessage = '';
    if (advancedUnlocked) {
      showAdvancedPanel = true;
      return;
    }
    advancedAccessError = '';
    cancelPattern();
    showAdvancedPrompt = true;
  }

  function closeAdvancedPrompt() {
    showAdvancedPrompt = false;
    cancelPattern();
    advancedAccessError = '';
  }

  function closeAdvancedPanel() {
    showAdvancedPanel = false;
    cacheMessage = '';
  }

  function addNodeToPattern(node: number) {
    if (!patternSequence.includes(node)) {
      patternSequence = [...patternSequence, node];
    }
  }

  function startPattern(node: number, event: PointerEvent | TouchEvent) {
    if (!advancedPatternConfigured) {
      advancedAccessError = 'Stel PUBLIC_ADVANCED_PATTERN in je .env bestand in.';
      return;
    }
    event.preventDefault();
    if ('pointerId' in event) {
      activePointerId = event.pointerId;
      (event.target as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    }
    patternActive = true;
    patternStatus = 'idle';
    addNodeToPattern(node);
    advancedAccessError = '';
  }

  function extendPattern(node: number, event: PointerEvent | TouchEvent) {
    if (!patternActive) return;
    event.preventDefault();
    addNodeToPattern(node);
  }

  function stopPattern(event?: Event) {
    if (!patternActive) return;
    event?.preventDefault();
    patternActive = false;
  }

  function submitPattern(event?: Event) {
    event?.preventDefault();
    if (patternSequence.length === 0) return;

    if (!advancedPatternConfigured) {
      advancedAccessError = 'Stel PUBLIC_ADVANCED_PATTERN in je .env bestand in.';
      patternSequence = [];
      return;
    }

    const submitted = patternSequence.join('');
    patternActive = false;

    if (submitted === expectedAdvancedPattern) {
      advancedUnlocked = true;
      showAdvancedPrompt = false;
      advancedAccessError = '';
      patternStatus = 'success';
      showAdvancedPanel = true;
    } else {
      patternStatus = 'error';
      advancedAccessError = 'Onjuist patroon. Probeer het opnieuw.';
      setTimeout(() => {
        patternStatus = 'idle';
      }, 600);
    }
  }

  function cancelPattern(event?: Event) {
    event?.preventDefault();
    patternActive = false;
    patternSequence = [];
    patternStatus = 'idle';
    activePointerId = null;
  }

  async function clearDeviceCache() {
    cacheClearing = true;
    cacheMessage = '';
    try {
      const res = await fetch('/api/wattage/cache', { method: 'POST' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const message =
          typeof payload.message === 'string' ? payload.message : 'Kon cache niet legen';
        throw new Error(message);
      }
      cacheMessage = 'Cache geleegd';
      await refreshWattage(true);
    } catch (error) {
      cacheMessage = error instanceof Error ? error.message : 'Kon cache niet legen';
    } finally {
      cacheClearing = false;
    }
  }

  const preventContextMenu = (evt: Event) => evt.preventDefault();

  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('contextmenu', preventContextMenu);
      loadDeviceStates().finally(() => {
        if (!wattageDisabled) {
          refreshWattage();
        }
      });
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('contextmenu', preventContextMenu);
    }
  });
</script>

<main class="flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
  <header class="border-b border-slate-200 bg-white/90 px-6 py-4 shadow-sm">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-xs uppercase tracking-wide text-slate-500">Kennermer scenes</p>
        <h1 class="text-3xl font-semibold tracking-tight text-slate-900">Kennermer Dashboard</h1>
        <p class="text-sm text-slate-500">Enkel de belangrijkste scene-knoppen en een duidelijke wattage-som.</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="rounded-2xl border border-emerald-500 bg-emerald-500 px-6 py-4 text-sm font-semibold uppercase tracking-[0.25em] text-white shadow-lg shadow-emerald-200/70 transition hover:bg-emerald-600 disabled:opacity-50"
          on:click={() => handleBulkCommand('on')}
          disabled={loadingCommandKey !== null}
        >
          Alles aan
        </button>
        <button
          type="button"
          class="rounded-2xl border border-rose-500 bg-rose-500 px-6 py-4 text-sm font-semibold uppercase tracking-[0.25em] text-white shadow-lg shadow-rose-200/70 transition hover:bg-rose-600 disabled:opacity-50"
          on:click={() => handleBulkCommand('off')}
          disabled={loadingCommandKey !== null}
        >
          Alles uit
        </button>
      </div>
    </div>
  </header>

  <div class="flex flex-1 gap-4 overflow-hidden px-4 pb-4 pt-4">
    <section class="flex w-full max-w-xs flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="space-y-4">
        <div>
          <p class="text-xs uppercase tracking-wide text-slate-500">Wattage</p>
          <p class="text-lg font-semibold text-slate-900">{wattageLabel}</p>
          <p class="text-xs text-slate-500">
            {#if wattageDisabled}
              Wattage uitgeschakeld
            {:else if wattageUpdatedAt}
              Laatste update {new Date(wattageUpdatedAt).toLocaleTimeString()}
            {:else}
              Nog geen data
            {/if}
          </p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
          <p class="text-xs uppercase tracking-wide text-slate-500">Totaal</p>
          <p class="text-2xl font-bold text-slate-900">
            {#if wattageDisabled}
              Uit
            {:else if wattageError}
              -
            {:else}
              {formatWatts(wattageTotal)}
            {/if}
          </p>
        </div>
        <button
          type="button"
          class="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-300 text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          on:click={() => refreshWattage(true)}
          disabled={wattageLoading || wattageDisabled}
        >
          <RefreshCw class={`h-8 w-8 ${wattageLoading ? 'animate-spin' : ''}`} />
          <span class="sr-only">Ververs wattage</span>
        </button>
        {#if wattageError}
          <p class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            {wattageError}
          </p>
        {/if}
      </div>
      <div class="mt-auto pt-4">
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 px-4 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-700 transition hover:bg-slate-100"
          on:click={openAdvancedAccess}
        >
          <span>Advanced gebruikers</span>
        </button>
      </div>
    </section>

    <section class="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header class="mb-4 flex items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-wide text-slate-500">Scènes</p>
          <h2 class="text-2xl font-semibold text-slate-900">Aan/uit knoppen</h2>
        </div>
        <span class="text-xs uppercase tracking-wide text-slate-400">{primaryDeviceCount} knoppen</span>
      </header>
      {#if errorMsg}
        <p class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          {errorMsg}
        </p>
      {/if}
      <div class="grid flex-1 grid-cols-1 gap-3 pb-2 pr-1 sm:grid-cols-2">
        {#each primaryDevices as device}
          <DeviceCard
            {device}
            {commandOrder}
            {commandKey}
            {commandLabel}
            {loadingCommandKey}
            initialStatus={deviceStates.get(device.id) ?? null}
            on:command={({ detail }) => handlePress(detail.deviceId, detail.command)}
          />
        {/each}
      </div>
    </section>
  </div>
</main>

{#if showAdvancedPrompt}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
    <div class="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
      <div class="space-y-1">
        <h2 class="text-lg font-semibold text-slate-800">Patroon vereist</h2>
        <p class="text-sm text-slate-600">
          Verbind het patroon om geavanceerde bediening te ontgrendelen.
        </p>
      </div>
      {#if !advancedPatternConfigured}
        <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
          Stel PUBLIC_ADVANCED_PATTERN in je .env bestand in om toegang te krijgen.
        </p>
      {/if}
      {#if advancedAccessError}
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-red-700">
          {advancedAccessError}
        </p>
      {/if}
      <div
        class="space-y-6"
        on:pointerup={(event) => {
          stopPattern(event);
          activePointerId = null;
        }}
        on:mouseup={stopPattern}
        on:touchend|preventDefault={stopPattern}
        on:pointercancel={cancelPattern}
        on:pointermove={(event) => {
          if (!patternActive) return;
          if (activePointerId !== null && event.pointerId !== activePointerId) return;
          const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
          const nodeValue = target?.dataset?.node;
          if (nodeValue !== undefined) {
            extendPattern(Number(nodeValue), event);
          }
        }}
      >
        <div class="grid select-none grid-cols-3 justify-items-center gap-6">
          {#each patternNodes as node (node)}
            {@const activeIndex = patternSequence.indexOf(node)}
            <button
              type="button"
              class={`relative flex h-20 w-20 items-center justify-center rounded-full border-2 transition ${
                patternStatus === 'error'
                  ? 'border-rose-400'
                  : patternStatus === 'success'
                    ? 'border-emerald-400'
                    : 'border-slate-300'
              } ${
                activeIndex >= 0
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200'
                  : 'bg-white text-slate-500'
              } ${node === 0 ? 'col-span-3 justify-self-center' : ''}`}
              data-node={node}
              on:pointerdown={(event) => startPattern(node, event)}
              on:pointerenter={(event) => extendPattern(node, event)}
              on:touchstart|preventDefault={(event) => startPattern(node, event)}
              on:touchmove|preventDefault={(event) => extendPattern(node, event)}
            >
              <span class="text-lg font-semibold">{node}</span>
              {#if activeIndex >= 0}
                <span class="pointer-events-none absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-emerald-600 shadow-md shadow-emerald-100">
                  {activeIndex + 1}
                </span>
              {/if}
            </button>
          {/each}
        </div>
        <div class="flex items-center justify-between gap-3">
          <button
            type="button"
            class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            on:click={closeAdvancedPrompt}
          >
            Annuleren
          </button>
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              on:click={cancelPattern}
              disabled={patternSequence.length === 0}
            >
              Reset
            </button>
            <button
              type="button"
              class="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold tracking-wide text-white transition-colors duration-150 ease-out hover:bg-slate-900 disabled:opacity-60"
              on:click={submitPattern}
              disabled={!advancedPatternConfigured || patternSequence.length === 0}
            >
              Ontgrendel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if advancedUnlocked && showAdvancedPanel}
  <div class="fixed inset-0 z-40 flex flex-col bg-slate-900/80 px-4 py-6 sm:px-8">
    <div class="relative mx-auto flex w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-xl">
      <header class="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-1">
          <h2 class="text-2xl font-semibold tracking-tight text-slate-900">Advanced Controls</h2>
          <p class="text-sm text-slate-600">Geavanceerde bedieningselementen voor gemachtigde gebruikers.</p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button
            type="button"
            class="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-200 disabled:opacity-60"
            on:click={clearDeviceCache}
            disabled={cacheClearing}
          >
            {#if cacheClearing}
              Cache legen…
            {:else}
              Wis IP cache
            {/if}
          </button>
          <button
            type="button"
            class="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-200"
            on:click={closeAdvancedPanel}
          >
            Sluiten
          </button>
        </div>
      </header>
      {#if cacheMessage}
        <p class="px-6 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{cacheMessage}</p>
      {/if}
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
                initialStatus={deviceStates.get(device.id) ?? null}
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
