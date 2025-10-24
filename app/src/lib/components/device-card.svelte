<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { DeviceCommandKey, ShellyDevice } from '$lib/config/schema';
  import type { StatusMap } from '$lib/api';

  const ACTIVE_STATUS_KEYWORDS = ['aan', 'on', 'open', 'enabled'];

  const baseCardClass =
    'flex flex-col gap-3 rounded-2xl border px-4 py-4 shadow-sm transition duration-300 ease-out';
  const cardInactiveClass = 'border-slate-200 bg-white/95';
  const cardActiveClass =
    'border-emerald-300/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-100 shadow-lg shadow-emerald-100/60 ring-2 ring-emerald-200';
  const cardOfflineClass = 'border-red-300 bg-red-50/90 shadow-inner ring-1 ring-red-100';

  const baseButtonClass =
    'relative flex min-h-[4.75rem] items-center justify-center rounded-xl px-5 py-6 text-xl font-semibold transition duration-150 ease-out enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60';
  const buttonNeutralClass =
    'border border-slate-300 bg-white text-slate-700 enabled:hover:bg-slate-50';
  const buttonOnProminentClass =
    'border border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-200/70 enabled:hover:bg-emerald-600';
  const buttonOffProminentClass =
    'border border-rose-500 bg-rose-500 text-white shadow-lg shadow-rose-200/70 enabled:hover:bg-rose-600';

  const INACTIVE_STATUS_KEYWORDS = ['uit', 'off', 'closed', 'disabled'];
  const OPTIMISTIC_TIMEOUT_MS = 6000;

  function normalizeStatus(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  const statusPillBaseClass =
    'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors duration-200';
  const statusDotBaseClass = 'h-2.5 w-2.5 rounded-full shadow-inner';

  export let device: ShellyDevice;
  export let statuses: StatusMap;
  export let commandOrder: DeviceCommandKey[];
  export let commandKey: (deviceId: string, command: DeviceCommandKey) => string;
  export let commandLabel: (device: ShellyDevice, command: DeviceCommandKey) => string;
  export let loadingCommandKey: string | null;
  export let cooldown: Set<string>;
  export let buttonMessages: Record<string, string>;
  export let getStatusEntry: (statuses: StatusMap, key?: string) => {
    value: string;
    label: string;
    timestamp: number;
    error?: string;
  } | null;
  export let statusHasIssue: (statuses: StatusMap, key?: string) => boolean;
  export let deviceStatusKey: (device: ShellyDevice) => string | undefined;
  export let showGroup = false;

  const dispatch = createEventDispatcher<{
    command: { deviceId: string; command: DeviceCommandKey };
  }>();

  $: statusKey = deviceStatusKey(device);
  $: statusEntry = getStatusEntry(statuses, statusKey);
  $: hasIssue = statusHasIssue(statuses, statusKey);
  $: statusLabel = (() => {
    if (!statusKey) return '—';
    if (!statusEntry) return '...';
    return statusEntry.value;
  })();
  $: statusError = statusEntry?.error ?? '';

  function cardClass() {
    const classes = [baseCardClass];
    if (hasIssue) {
      classes.push(cardOfflineClass);
    } else {
      classes.push(serverIsActive ? cardActiveClass : cardInactiveClass);
    }
    return classes.join(' ');
  }

  function statusPillClass() {
    if (!statusKey) return `${statusPillBaseClass} border-slate-200 bg-slate-100 text-slate-600`;
    if (hasIssue) return `${statusPillBaseClass} border-red-200 bg-red-50 text-red-700`;
    if (serverIsActive)
      return `${statusPillBaseClass} border-emerald-200 bg-emerald-50/90 text-emerald-700`;
    if (serverIsInactive)
      return `${statusPillBaseClass} border-rose-200 bg-rose-50 text-rose-700`;
    return `${statusPillBaseClass} border-slate-200 bg-slate-100 text-slate-600`;
  }

  function statusDotClass() {
    if (!statusKey) return `${statusDotBaseClass} bg-slate-300`;
    if (hasIssue) return `${statusDotBaseClass} bg-red-500`;
    if (serverIsActive) return `${statusDotBaseClass} bg-emerald-500`;
    if (serverIsInactive) return `${statusDotBaseClass} bg-rose-500`;
    return `${statusDotBaseClass} bg-slate-300`;
  }

  $: normalizedStatusValue = normalizeStatus(statusEntry?.value ?? '');
  $: serverIsActive = normalizedStatusValue
    ? ACTIVE_STATUS_KEYWORDS.some((keyword) => normalizedStatusValue.includes(keyword))
    : false;
  $: serverIsInactive = normalizedStatusValue
    ? INACTIVE_STATUS_KEYWORDS.some((keyword) => normalizedStatusValue.includes(keyword))
    : false;
  let optimisticStatus: DeviceCommandKey | null = null;
  let uiIsActive = false;
  let uiIsInactive = false;
  let optimisticResetTimer: ReturnType<typeof setTimeout> | null = null;
  const currentOptimisticKey = () =>
    optimisticStatus ? commandKey(device.id, optimisticStatus) : null;

  $: {
    if (optimisticStatus === 'on' && serverIsActive) {
      optimisticStatus = null;
    } else if (optimisticStatus === 'off' && serverIsInactive) {
      optimisticStatus = null;
    }
  }

  $: {
    const optimisticKey = currentOptimisticKey();
    if (optimisticKey) {
      if (buttonMessages[optimisticKey] || cooldown.has(optimisticKey)) {
        optimisticStatus = null;
      }
    }
  }

  $: uiIsActive =
    optimisticStatus === 'on' ? true : optimisticStatus === 'off' ? false : serverIsActive;
  $: uiIsInactive =
    optimisticStatus === 'off' ? true : optimisticStatus === 'on' ? false : serverIsInactive;

  function clearOptimisticTimer() {
    if (optimisticResetTimer) {
      clearTimeout(optimisticResetTimer);
      optimisticResetTimer = null;
    }
  }

  function startOptimisticReset(targetKey: string) {
    clearOptimisticTimer();
    optimisticResetTimer = setTimeout(() => {
      if (currentOptimisticKey() === targetKey) {
        optimisticStatus = null;
      }
    }, OPTIMISTIC_TIMEOUT_MS);
  }

  $: if (!optimisticStatus) {
    clearOptimisticTimer();
  }

  function computeButtonClass(command: DeviceCommandKey, key: string) {
    const classes = [baseButtonClass];

    if (command === 'on') {
      classes.push(uiIsActive ? buttonOnProminentClass : buttonNeutralClass);
    } else {
      classes.push(uiIsInactive ? buttonOffProminentClass : buttonNeutralClass);
    }

    if (loadingCommandKey === key) {
      classes.push('ring-2 ring-blue-200 ring-offset-2 ring-offset-white');
    }

    if (cooldown.has(key)) {
      classes.push('opacity-60');
    }

    return classes.join(' ');
  }

  type CommandVisualState = {
    key: string;
    className: string;
    ariaPressed: boolean;
  };

  let commandVisualStates: Partial<Record<DeviceCommandKey, CommandVisualState>> = {};

  $: commandVisualStates = commandOrder.reduce(
    (acc, command) => {
      if (!device.commands[command]) return acc;
      const key = commandKey(device.id, command);
      acc[command] = {
        key,
        className: computeButtonClass(command, key),
        ariaPressed: command === 'on' ? uiIsActive : uiIsInactive
      };
      return acc;
    },
    {} as Partial<Record<DeviceCommandKey, CommandVisualState>>
  );

  function handleCommand(command: DeviceCommandKey) {
    const key = commandKey(device.id, command);
    optimisticStatus = command;
    startOptimisticReset(key);
    dispatch('command', { deviceId: device.id, command });
  }

  onDestroy(() => {
    clearOptimisticTimer();
  });
</script>

<section class={cardClass()}>
  <div class="flex items-center justify-between gap-4">
    <div class="min-w-0">
      <h3 class="truncate text-lg font-semibold tracking-tight text-slate-800 sm:text-xl">
        {device.label}
      </h3>
      {#if showGroup}
        <p class="text-xs uppercase tracking-wide text-slate-400">{device.group}</p>
      {/if}
    </div>
    {#if device.status}
      <span class={statusPillClass()}>
        <span class={statusDotClass()} aria-hidden="true"></span>
        {statusLabel}
      </span>
    {/if}
  </div>

  {#if device.status && hasIssue}
    <p class="text-xs font-semibold text-red-600">
      {statusError || 'Apparaat offline'}
    </p>
  {/if}

  <div class="grid grid-cols-2 gap-2">
    {#each commandOrder as cmd}
      {#if device.commands[cmd]}
        {@const state = commandVisualStates[cmd]}
        {#if state}
          <button
            type="button"
            class={state.className}
            aria-pressed={state.ariaPressed}
            on:click={() => handleCommand(cmd)}
            disabled={cooldown.has(state.key)}
          >
            <span class="pointer-events-none text-center">{commandLabel(device, cmd)}</span>
            {#if buttonMessages[state.key]}
              <span class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/60 text-sm font-semibold uppercase tracking-wide text-white">
                {buttonMessages[state.key]}
              </span>
            {/if}
          </button>
        {/if}
      {/if}
    {/each}
  </div>
</section>
