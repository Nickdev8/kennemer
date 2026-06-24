<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import DeviceCard from '$lib/components/device-card.svelte';
  import TriggerCard from '$lib/components/trigger-card.svelte';
  import { devices as primaryDevices } from '$lib/config/devices';
  import { advancedDevices, advancedTriggers } from '$lib/config/advanced';
  import { env as publicEnv } from '$env/dynamic/public';
  import type { DeviceCommandKey, ShellyDevice } from '$lib/config/schema';
  import { triggerAction, triggerDeviceCommand } from '$lib/api';
  import type { PageData } from './$types';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';

  type WattageDeviceSummary = {
    deviceId: string;
    name: string;
    ip: string;
    channel: number | null;
    watts: number;
    output: boolean | null;
    source?: 'lan-rpc' | 'lan-status' | 'cloud' | 'cached' | 'unknown';
    timestamp?: number | null;
    capability?: 'metered' | 'not-metered' | 'unknown';
    state?: 'ok' | 'unavailable';
  };

  function readBooleanFlag(value: string | undefined) {
    if (!value) return false;
    const normalised = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalised);
  }

  function readPositiveNumber(value: string | undefined, fallback: number) {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  const wattageDisabled = readBooleanFlag(publicEnv.PUBLIC_DISABLE_WATTAGE);
  const displayDimTimeoutMs = readPositiveNumber(
    publicEnv.PUBLIC_DISPLAY_DIM_TIMEOUT_MS,
    10 * 60 * 1000
  );

  const expectedAdvancedPattern = (
    publicEnv.PUBLIC_ADVANCED_PATTERN ??
    publicEnv.PUBLIC_ADVANCED_PIN ??
    ''
  )
    .replace(/[^0-9]/g, '')
    .trim();
  const advancedPatternConfigured = expectedAdvancedPattern.length > 0;
  const patternNodes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
  const wattageDebug = readBooleanFlag(publicEnv.PUBLIC_DEBUG_WATTAGE);

  export let data: PageData;

  let loadingCommandKey: string | null = null;
  let errorMsg = '';
  let advancedErrorMsg = '';
  let deviceStates = new Map<string, DeviceCommandKey>(
    Object.entries(data?.deviceStates ?? {}) as [string, DeviceCommandKey][]
  );

  const primaryDeviceCount = primaryDevices.length;

  const advancedSectionOrder = [
    { id: 'techniek', label: 'Techniek', deviceIds: ['voordeur'] },
    {
      id: 'licht-techniek',
      label: 'Licht techniek',
      deviceIds: [
        'licht-poort-hfd',
        'licht-pannenkoek',
        'licht-onder-kap-plein-1-2',
        'sportveld-led',
        'ledstrip-overkapping-plein-3',
        'garderobe-nb',
        'groen-achter-kopje-ketelhuis',
        'groen-voor-kopje-magazijn',
        'cv-licht',
        'hek-groen'
      ]
    },
    {
      id: 'power-socket',
      label: 'Power socket',
      deviceIds: ['gedenklicht', 'wcd-hek-2', 'wcd-buiten-magazijn']
    }
  ];

  const advancedDeviceMap = new Map(advancedDevices.map((device) => [device.id, device]));
  const advancedSections = advancedSectionOrder.map((section) => ({
    ...section,
    devices: section.deviceIds
      .map((deviceId) => advancedDeviceMap.get(deviceId))
      .filter(Boolean) as ShellyDevice[]
  }));

  const advancedDeviceCount = advancedSections.reduce(
    (total, section) => total + section.devices.length,
    0
  );

  const wattageRoomId = -1;
  let wattageLabel = `Room ${wattageRoomId}`;
  let wattageTotal = 0;
  let wattageDevices: WattageDeviceSummary[] = [];
  let wattageError = '';
  let wattageLoading = false;
  let wattageStale = false;
  let wattageUpdatedAt: number | null = null;
  let wattageInventory:
    | {
        totalCount: number;
        onlineCount: number;
        offlineCount: number;
        unknownStatusCount: number;
      }
    | null = null;
  let wattageSummary:
    | {
        unavailableCount: number;
        notMeteredCount: number;
        meteredCount: number;
        unknownCapabilityCount: number;
        cachedCount: number;
        cloudCount: number;
        lanRpcCount: number;
        lanStatusCount: number;
      }
    | null = null;
  let topWattageDevices: WattageDeviceSummary[] = [];
  let topWattageMax = 1;
  let availableWattageMeasurements = 0;
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
  let advancedIdleTimeout: ReturnType<typeof setTimeout> | null = null;
  let displayDimTimeout: ReturnType<typeof setTimeout> | null = null;
  let displayDimmed = false;
  let stateStream: EventSource | null = null;
  let loadingTriggerId: string | null = null;

  const commandOrder: DeviceCommandKey[] = ['on', 'off'];

  const commandKey = (deviceId: string, command: DeviceCommandKey) => `${deviceId}:${command}`;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const normalWattageRefreshMs = 5 * 60 * 1000;
  const fastWattageRefreshMs = 2 * 60 * 1000;
  const fastWattageWindowMs = 10 * 60 * 1000;

  $: topWattageDevices = [...wattageDevices]
    .filter(
      (device) =>
        device.state !== 'unavailable' &&
        device.capability === 'metered' &&
        Number.isFinite(device.watts) &&
        device.watts > 0
    )
    .sort((left, right) => right.watts - left.watts)
    .slice(0, 3);
  $: topWattageMax = Math.max(1, ...topWattageDevices.map((device) => device.watts));
  $: availableWattageMeasurements = wattageSummary
    ? Math.max(0, wattageSummary.meteredCount - wattageSummary.unavailableCount)
    : 0;

  function clearAdvancedIdleTimer() {
    if (advancedIdleTimeout) {
      clearTimeout(advancedIdleTimeout);
      advancedIdleTimeout = null;
    }
  }

  function startAdvancedIdleTimer(mode: 'prompt' | 'panel') {
    clearAdvancedIdleTimer();
    advancedIdleTimeout = setTimeout(() => {
      if (mode === 'prompt' && showAdvancedPrompt) {
        closeAdvancedPrompt();
      } else if (mode === 'panel' && showAdvancedPanel) {
        closeAdvancedPanel();
      }
    }, 10000);
  }

  function markAdvancedActivity() {
    if (showAdvancedPanel) {
      startAdvancedIdleTimer('panel');
    } else if (showAdvancedPrompt) {
      startAdvancedIdleTimer('prompt');
    }
  }

  function clearDisplayDimTimer() {
    if (displayDimTimeout) {
      clearTimeout(displayDimTimeout);
      displayDimTimeout = null;
    }
  }

  function scheduleDisplayDim() {
    clearDisplayDimTimer();
    if (displayDimTimeoutMs <= 0) return;
    displayDimTimeout = setTimeout(() => {
      displayDimmed = true;
      displayDimTimeout = null;
    }, displayDimTimeoutMs);
  }

  function markDisplayActivity() {
    displayDimmed = false;
    scheduleDisplayDim();
  }

  function wakeDisplay(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    markDisplayActivity();
  }

  async function refreshWattage(forceRefresh = false) {
    if (wattageDisabled) {
      wattageLabel = `Room ${wattageRoomId}`;
      wattageTotal = 0;
      wattageDevices = [];
      wattageUpdatedAt = null;
      wattageError = '';
      wattageStale = false;
      wattageInventory = null;
      wattageSummary = null;
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
        inventory?: {
          totalCount: number;
          onlineCount: number;
          offlineCount: number;
          unknownStatusCount: number;
        };
        summary?: {
          unavailableCount: number;
          notMeteredCount: number;
          meteredCount: number;
          unknownCapabilityCount: number;
          cachedCount: number;
          cloudCount: number;
          lanRpcCount: number;
          lanStatusCount: number;
        };
      };

      if (!data.ok) {
        throw new Error('Onverwachte wattage respons');
      }

      wattageLabel = data.label;
      wattageTotal = data.totalWatts ?? 0;
      wattageDevices = data.devices ?? [];
      wattageInventory = data.inventory ?? null;
      wattageSummary = data.summary ?? null;
      wattageUpdatedAt = Date.now();
      wattageStale = false;
    } catch (error) {
      wattageError = error instanceof Error ? error.message : 'Kon vermogen niet ophalen';
      wattageStale = wattageUpdatedAt !== null;
    } finally {
      wattageLoading = false;
      scheduleAutomaticWattageRefresh();
    }
  }

  function formatWatts(value: number) {
    return `${value.toFixed(1)} W`;
  }

  function formatTotalWatts(value: number) {
    return `${Math.round(value)} W`;
  }

  function formatDeviceState(device: WattageDeviceSummary) {
    if (device.output === true) return 'Aan';
    if (device.output === false) return 'Uit';
    return 'Onbekend';
  }

  function commandLabel(device: ShellyDevice, command: DeviceCommandKey) {
    const config = device.commands[command];
    if (!config) return command === 'on' ? 'Aan' : 'Uit';
    return config.label ?? (command === 'on' ? 'Aan' : 'Uit');
  }

  function resolveToggleCommand(status: DeviceCommandKey | null) {
    return status === 'on' ? 'off' : 'on';
  }

  type PressOptions = { suppressRefresh?: boolean; stateless?: boolean };

  let wattageRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let wattageAutomaticRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let fastWattageRefreshUntil = 0;

  function scheduleAutomaticWattageRefresh() {
    if (wattageDisabled || typeof window === 'undefined') return;
    if (wattageAutomaticRefreshTimeout) {
      clearTimeout(wattageAutomaticRefreshTimeout);
    }

    const delay =
      Date.now() < fastWattageRefreshUntil ? fastWattageRefreshMs : normalWattageRefreshMs;
    wattageAutomaticRefreshTimeout = setTimeout(() => {
      wattageAutomaticRefreshTimeout = null;
      void refreshWattage(true);
    }, delay);
  }

  function startFastWattageRefreshWindow() {
    fastWattageRefreshUntil = Date.now() + fastWattageWindowMs;
    scheduleAutomaticWattageRefresh();
  }

  function handleManualWattageRefresh() {
    startFastWattageRefreshWindow();
    void refreshWattage(true);
  }

  function requestWattageRefresh() {
    if (wattageDisabled) return;
    startFastWattageRefreshWindow();
    if (wattageRefreshTimeout) clearTimeout(wattageRefreshTimeout);
    wattageRefreshTimeout = setTimeout(() => {
      wattageRefreshTimeout = null;
      void refreshWattage(true);
    }, 150);
  }

  async function handlePress(
    deviceId: string,
    command: DeviceCommandKey,
    options: PressOptions = {}
  ): Promise<void> {
    const key = commandKey(deviceId, command);
    loadingCommandKey = key;
    errorMsg = '';
    let succeeded = false;
    try {
      await triggerDeviceCommand(deviceId, command);
      if (!options.stateless) {
        setDeviceState(deviceId, command);
      }
      succeeded = true;
      if (advancedUnlocked && showAdvancedPanel) {
        markAdvancedActivity();
      }
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error?.code === 'RATE_LIMIT') {
        await sleep(1000);
        return handlePress(deviceId, command);
      }
      errorMsg = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      loadingCommandKey = null;
      if (succeeded && !options.suppressRefresh) {
        requestWattageRefresh();
      }
    }
  }

  async function handleBulkCommand(command: DeviceCommandKey) {
    for (const device of primaryDevices) {
      await handlePress(device.id, command, { suppressRefresh: true });
      await sleep(50);
    }
    requestWattageRefresh();
  }

  function setDeviceState(deviceId: string, command: DeviceCommandKey) {
    const next = new Map(deviceStates);
    next.set(deviceId, command);
    deviceStates = next;
  }

  function applyDeviceStates(states: Record<string, { lastCommand: DeviceCommandKey }>) {
    const next = new Map<string, DeviceCommandKey>();
    Object.entries(states).forEach(([id, entry]) => {
      if (entry?.lastCommand) {
        next.set(id, entry.lastCommand);
      }
    });
    deviceStates = next;
  }

  function applyDeviceStateUpdate(deviceId: string, command: DeviceCommandKey) {
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
      applyDeviceStates(payload.states);
    } catch {
    }
  }

  function startStateStream() {
    if (typeof window === 'undefined' || stateStream) return;
    const stream = new EventSource('/api/device-state/stream');

    stream.addEventListener('init', (event) => {
      const data = (event as MessageEvent<string>).data;
      if (!data) return;
      try {
        const payload = JSON.parse(data) as Record<string, { lastCommand: DeviceCommandKey }>;
        if (payload) {
          applyDeviceStates(payload);
        }
      } catch {
      }
    });

    stream.addEventListener('state', (event) => {
      const data = (event as MessageEvent<string>).data;
      if (!data) return;
      try {
        const payload = JSON.parse(data) as {
          deviceId: string;
          state: { lastCommand: DeviceCommandKey };
        };
        if (payload?.deviceId && payload.state?.lastCommand) {
          applyDeviceStateUpdate(payload.deviceId, payload.state.lastCommand);
        }
      } catch {
      }
    });

    stream.addEventListener('error', () => {
      stream.close();
      stateStream = null;
    });

    stateStream = stream;
  }

  function openAdvancedAccess() {
    cacheMessage = '';
    if (advancedUnlocked) {
      showAdvancedPanel = true;
      markAdvancedActivity();
      return;
    }
    advancedAccessError = '';
    cancelPattern();
    showAdvancedPrompt = true;
    markAdvancedActivity();
  }

  function closeAdvancedPrompt() {
    showAdvancedPrompt = false;
    cancelPattern();
    advancedAccessError = '';
    clearAdvancedIdleTimer();
  }

  function closeAdvancedPanel() {
    showAdvancedPanel = false;
    cancelPattern();
    advancedAccessError = '';
    advancedUnlocked = false;
    cacheMessage = '';
    clearAdvancedIdleTimer();
  }

  function addNodeToPattern(node: number) {
    if (!patternSequence.includes(node)) {
      patternSequence = [...patternSequence, node];
    }
    markAdvancedActivity();
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
    markAdvancedActivity();
  }

  function extendPattern(node: number, event: PointerEvent | TouchEvent) {
    if (!patternActive) return;
    event.preventDefault();
    addNodeToPattern(node);
    markAdvancedActivity();
  }

  function stopPattern(event?: Event) {
    if (!patternActive) return;
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
      markAdvancedActivity();
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
    markAdvancedActivity();
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

  async function handleTriggerPress(triggerId: string) {
    loadingTriggerId = triggerId;
    advancedErrorMsg = '';
    let succeeded = false;
    try {
      await triggerAction(triggerId);
      succeeded = true;
      if (advancedUnlocked && showAdvancedPanel) {
        markAdvancedActivity();
      }
    } catch (err) {
      advancedErrorMsg = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      loadingTriggerId = null;
      if (succeeded) {
        requestWattageRefresh();
      }
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('contextmenu', preventContextMenu);
      window.addEventListener('pointerdown', markDisplayActivity, { passive: true });
      window.addEventListener('keydown', markDisplayActivity);
      scheduleDisplayDim();
      loadDeviceStates().finally(() => {
        if (!wattageDisabled) {
          void refreshWattage(true);
        }
      });
      startStateStream();
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('contextmenu', preventContextMenu);
      window.removeEventListener('pointerdown', markDisplayActivity);
      window.removeEventListener('keydown', markDisplayActivity);
    }
    if (wattageRefreshTimeout) {
      clearTimeout(wattageRefreshTimeout);
    }
    if (wattageAutomaticRefreshTimeout) {
      clearTimeout(wattageAutomaticRefreshTimeout);
    }
    if (stateStream) {
      stateStream.close();
      stateStream = null;
    }
    clearAdvancedIdleTimer();
    clearDisplayDimTimer();
  });
</script>

<main class="flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
  <header class="border-b border-slate-200 bg-white/90 px-6 py-4 shadow-sm">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-xs uppercase tracking-wide text-slate-500">Dashboard</p>
        <h1 class="text-3xl font-semibold tracking-tight text-slate-900">HFD</h1>
      </div>
      <div class="flex flex-wrap items-center gap-3">
      </div>
    </div>
  </header>

  <div class="flex min-h-0 flex-1 gap-4 overflow-hidden px-4 pb-4 pt-4">
    <section class="flex w-[26rem] shrink-0 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase text-slate-500">Energie & apparaten</p>
          <h2 class="mt-1 text-xl font-semibold text-slate-900">{wattageLabel}</h2>
          <p class={`mt-1 text-xs ${wattageStale ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>
            {#if wattageDisabled}
              Metingen uitgeschakeld
            {:else if wattageUpdatedAt}
              {wattageStale ? 'Verouderde data van' : 'Bijgewerkt om'}
              {new Date(wattageUpdatedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            {:else if wattageLoading}
              Gegevens ophalen...
            {:else}
              Nog geen gegevens
            {/if}
          </p>
        </div>
        <button
          type="button"
          class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50"
          on:click={handleManualWattageRefresh}
          disabled={wattageLoading || wattageDisabled}
        >
          <RefreshCw class={`h-6 w-6 ${wattageLoading ? 'animate-spin' : ''}`} />
          <span class="sr-only">Ververs energiegegevens</span>
        </button>
      </div>

      <div class="mt-5 border-y border-slate-200 py-4">
        <p class="text-xs font-semibold uppercase text-slate-500">Huidig gemeten vermogen</p>
        <p class="mt-1 text-5xl font-bold text-slate-950">
          {#if wattageDisabled}
            Uit
          {:else if wattageUpdatedAt}
            {formatTotalWatts(wattageTotal)}
          {:else}
            —
          {/if}
        </p>
      </div>

      <div class="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <div class="grid grid-cols-2">
          <div class="border-b border-r border-slate-200 px-4 py-3">
            <p class="text-xs font-medium text-slate-500">Alle apparaten</p>
            <p class="mt-1 text-2xl font-semibold text-slate-900">
              {wattageInventory?.totalCount ?? '—'}
            </p>
          </div>
          <div class="border-b border-slate-200 px-4 py-3">
            <p class="text-xs font-medium text-emerald-700">Online</p>
            <p class="mt-1 text-2xl font-semibold text-emerald-700">
              {wattageInventory?.onlineCount ?? '—'}
            </p>
          </div>
          <div class="border-r border-slate-200 px-4 py-3">
            <p class="text-xs font-medium text-amber-700">Offline</p>
            <p class="mt-1 text-2xl font-semibold text-amber-700">
              {wattageInventory?.offlineCount ?? '—'}
            </p>
          </div>
          <div class="px-4 py-3">
            <p class="text-xs font-medium text-slate-500">Status onbekend</p>
            <p class="mt-1 text-2xl font-semibold text-slate-700">
              {wattageInventory?.unknownStatusCount ?? '—'}
            </p>
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between border-b border-slate-200 pb-4">
        <span class="text-sm text-slate-600">Vermogensmetingen</span>
        <span class="text-sm font-semibold text-slate-900">
          {#if wattageSummary}
            {availableWattageMeasurements} van {wattageSummary.meteredCount} beschikbaar
          {:else}
            —
          {/if}
        </span>
      </div>

      <div class="mt-4">
        <div class="flex items-baseline justify-between gap-3">
          <h3 class="text-sm font-semibold text-slate-900">Topverbruikers</h3>
          <span class="text-xs text-slate-500">Nu</span>
        </div>
        {#if topWattageDevices.length > 0}
          <ol class="mt-3 space-y-3">
            {#each topWattageDevices as device, index}
              <li>
                <div class="flex items-center justify-between gap-4 text-sm">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="w-4 shrink-0 text-xs font-semibold text-slate-400">{index + 1}</span>
                    <span class="truncate font-medium text-slate-700">{device.name}</span>
                  </div>
                  <span class="shrink-0 font-semibold text-slate-900">{formatWatts(device.watts)}</span>
                </div>
                <div class="ml-6 mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    class="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                    style={`width: ${Math.max(4, (device.watts / topWattageMax) * 100)}%`}
                  ></div>
                </div>
              </li>
            {/each}
          </ol>
        {:else}
          <p class="mt-3 text-sm text-slate-500">
            {wattageLoading ? 'Verbruikers ophalen...' : 'Geen actief verbruik gemeten'}
          </p>
        {/if}
      </div>

      {#if wattageError}
        <p class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          {wattageStale ? 'Vernieuwen mislukt. De vorige gegevens blijven zichtbaar.' : wattageError}
        </p>
      {/if}

      <div class="mt-auto pt-4">
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold uppercase text-slate-700 transition hover:bg-slate-100 active:bg-slate-200"
          on:click={openAdvancedAccess}
        >
          <span>Advanced gebruikers</span>
        </button>
      </div>
    </section>

    <section class="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header class="mb-4 flex items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-wide text-slate-500">Scènes</p>
          <h2 class="text-2xl font-semibold text-slate-900">Scene bediening</h2>
        </div>
        <span class="text-xs uppercase tracking-wide text-slate-400">{primaryDeviceCount} knoppen</span>
      </header>
      {#if errorMsg}
        <p class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          {errorMsg}
        </p>
      {/if}
      <div class="grid h-full flex-1 grid-cols-3 grid-rows-3 gap-6 pb-2 pr-1">
        {#each primaryDevices as device}
          <DeviceCard
            {device}
            {commandOrder}
            {commandKey}
            {commandLabel}
            {resolveToggleCommand}
            {loadingCommandKey}
            initialStatus={deviceStates.get(device.id) ?? null}
            on:command={({ detail }) =>
              handlePress(detail.deviceId, detail.command, { stateless: device.stateless })
            }
          />
        {/each}
      </div>
    </section>
  </div>

  {#if displayDimmed}
    <button
      type="button"
      class="fixed inset-0 z-[70] cursor-default bg-slate-950/65 transition-opacity duration-500"
      aria-label="Scherm actief maken"
      on:click={wakeDisplay}
      on:pointerdown={wakeDisplay}
      on:keydown={wakeDisplay}
    ></button>
  {/if}
</main>

{#if showAdvancedPrompt}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4"
    tabindex="-1"
    on:click={closeAdvancedPrompt}
    on:keydown={markAdvancedActivity}
  >
    <div
      class="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      on:click|stopPropagation
    >
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
  <div
    class="fixed inset-0 z-40 flex flex-col bg-slate-900/80 px-4 py-6 sm:px-8"
    on:click={closeAdvancedPanel}
    on:pointerdown={markAdvancedActivity}
    on:keydown={markAdvancedActivity}
    tabindex="-1"
  >
    <div
      class="relative mx-auto flex w-[90vw] max-w-[1800px] flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-xl"
      on:click|stopPropagation
    >
      <header class="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-1">
          <h2 class="text-2xl font-semibold tracking-tight text-slate-900">Advanced Controls</h2>
          <p class="text-sm text-slate-600">Geavanceerde bedieningselementen voor gemachtigde gebruikers.</p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button
            type="button"
            class="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-200"
            on:click={closeAdvancedPanel}
          >
            Sluiten
          </button>
        </div>
      </header>
      <div class="flex min-h-0 flex-1 flex-col gap-6 px-6 py-6 lg:flex-row">
        <section class="flex min-h-0 flex-1 flex-col">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Advanced devices</p>
            <span class="text-xs uppercase tracking-wide text-slate-400">{advancedDeviceCount} knoppen</span>
          </div>
          {#if advancedErrorMsg}
            <p class="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
              {advancedErrorMsg}
            </p>
          {/if}
          <div
            class="min-h-0 flex-1 overflow-y-auto pr-2"
            on:scroll={markAdvancedActivity}
            on:wheel|passive={markAdvancedActivity}
            on:touchmove|passive={markAdvancedActivity}
            on:pointerdown={markAdvancedActivity}
            on:mousedown={markAdvancedActivity}
          >
            {#if advancedDeviceCount === 0}
              <p class="text-sm text-slate-600">
                Geen geavanceerde apparaten geconfigureerd in
                <code class="rounded bg-slate-100 px-2 py-0.5 text-xs">app/config/advanced.ts</code>.
              </p>
            {:else}
              <div class="flex flex-col gap-6 pb-4">
                {#each advancedSections as section (section.id)}
                  <div class="space-y-4">
                    <div class="flex items-center gap-3">
                      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {section.label}
                      </p>
                      <span class="h-px flex-1 bg-slate-200"></span>
                    </div>
                    <div
                      class={`grid gap-4 ${
                        ['techniek', 'licht-techniek', 'power-socket'].includes(section.id)
                          ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                          : 'grid-cols-1'
                      }`}
                    >
                      {#each section.devices as device (device.id)}
                        <DeviceCard
                          {device}
                          {commandOrder}
                          {commandKey}
                          {commandLabel}
                          {resolveToggleCommand}
                          {loadingCommandKey}
                          initialStatus={deviceStates.get(device.id) ?? null}
                          on:command={({ detail }) =>
                            handlePress(detail.deviceId, detail.command, {
                              stateless: device.stateless
                            })
                          }
                        />
                      {/each}
                    </div>
                  </div>
                  {#if section.id === 'techniek'}
                    <div class="space-y-4">
                      <div class="flex items-center gap-3">
                        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Set kleur licht
                        </p>
                        <span class="h-px flex-1 bg-slate-200"></span>
                      </div>
                      <div class="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {#each advancedTriggers as trigger (trigger.id)}
                          <div class="flex h-full items-center">
                            <TriggerCard
                              {trigger}
                              {loadingTriggerId}
                              on:trigger={({ detail }) => handleTriggerPress(detail.triggerId)}
                            />
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        </section>

        <aside class="w-full space-y-4 lg:w-[400px] lg:flex-shrink-0">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">System actions</p>
            <div class="mt-3 grid gap-2">
              <button
                type="button"
                class="w-full rounded-xl border border-slate-300 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-100 disabled:opacity-60"
                on:click={clearDeviceCache}
                disabled={cacheClearing}
              >
                {#if cacheClearing}
                  Cache legen…
                {:else}
                  Wis IP cache
                {/if}
              </button>
              {#if cacheMessage}
                <p class="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {cacheMessage}
                </p>
              {/if}
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Wattage diagnostiek</p>
            {#if wattageDisabled}
              <p class="mt-3 text-sm text-slate-600">Wattage is uitgeschakeld.</p>
            {:else if wattageError}
              <p class="mt-3 text-sm text-amber-700">{wattageError}</p>
            {:else if wattageSummary}
              <div class="mt-3 space-y-2 text-sm text-slate-700">
                {#if wattageSummary.unavailableCount > 0}
                  <p class="font-semibold text-amber-700">
                    {wattageSummary.unavailableCount} apparaten onbekend
                  </p>
                {:else}
                  <p class="text-slate-600">Geen ontbrekende metingen.</p>
                {/if}
                <div class="grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <span>Gemeten: {wattageSummary.meteredCount}</span>
                  <span>Niet gemeten: {wattageSummary.notMeteredCount}</span>
                  <span>Onbekend: {wattageSummary.unknownCapabilityCount}</span>
                  <span>Fallback: {wattageSummary.cachedCount + wattageSummary.cloudCount}</span>
                </div>
              </div>
            {:else}
              <p class="mt-3 text-sm text-slate-600">Nog geen diagnoseresultaten.</p>
            {/if}
          </div>

          {#if wattageDebug}
            <details class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
                Wattage debug lijst
              </summary>
              {#if wattageSummary}
                <p class="mt-3 text-xs text-slate-400">
                  RPC {wattageSummary.lanRpcCount} · Status {wattageSummary.lanStatusCount} ·
                  Cache {wattageSummary.cachedCount} · Cloud {wattageSummary.cloudCount}
                </p>
              {/if}
              {#if wattageDevices.length === 0}
                <p class="mt-3 text-sm text-slate-500">Geen wattage data.</p>
              {:else}
                <div class="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-700">
                  {#each wattageDevices as device}
                    <div class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span class="truncate">{device.name}</span>
                      <span class="ml-3 shrink-0 text-xs font-semibold text-slate-500">
                        {device.source ?? 'unknown'} · {device.capability ?? 'unknown'} · {formatWatts(device.watts)}
                      </span>
                    </div>
                  {/each}
                </div>
              {/if}
            </details>
          {/if}
        </aside>
      </div>
    </div>
  </div>
{/if}
