<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import DeviceCard from '$lib/components/device-card.svelte';
	import TriggerCard from '$lib/components/trigger-card.svelte';
	import { devices as configuredPrimaryDevices } from '$lib/config/devices';
	import { advancedDevices, advancedTriggers } from '$lib/config/advanced';
	import { energyDevicesTrigger } from '$lib/config/triggers';
	import { env as publicEnv } from '$env/dynamic/public';
	import type { DeviceCommandKey, ShellyDevice } from '$lib/config/schema';
	import {
		getDeviceConfigurationIssues,
		isDeviceCommandConfigured,
		isValidStatusDeviceId
	} from '$lib/config/device-validation';
	import { triggerAction, triggerDeviceCommand } from '$lib/api';
	import type { PageData } from './$types';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Pin from 'lucide-svelte/icons/pin';
	import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
	import TouchpadOff from 'lucide-svelte/icons/touchpad-off';
	import WifiOff from 'lucide-svelte/icons/wifi-off';

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

	type InventoryDevice = {
		deviceId: string;
		name: string;
		ip: string;
	};

	type DiagnosticEntry = {
		id: string;
		name: string;
		detail: string;
	};

	type DiagnosticGroup = {
		id: string;
		label: string;
		entries: DiagnosticEntry[];
	};

	type UpdateStatus = {
		ok: boolean;
		message?: string;
		branch?: string;
		currentShort?: string;
		targetShort?: string;
		updateAvailable?: boolean;
		fastForward?: boolean;
		updating?: boolean;
		updateStarted?: boolean;
		fetchOk?: boolean;
		fetchError?: string;
		service?: {
			activeState?: string;
			subState?: string;
			result?: string;
		};
	};

	type UpdatePhase =
		| 'idle'
		| 'checking'
		| 'available'
		| 'blocked'
		| 'starting'
		| 'running'
		| 'success'
		| 'error';

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

	function readAdvancedPatterns(...values: Array<string | undefined>) {
		return values
			.flatMap((value) => value?.split(/[,\s;|]+/) ?? [])
			.map((value) => value.replace(/[^0-9]/g, '').trim())
			.filter(Boolean);
	}

	const wattageDisabled = readBooleanFlag(publicEnv.PUBLIC_DISABLE_WATTAGE);
	const displayDimTimeoutMs = readPositiveNumber(
		publicEnv.PUBLIC_DISPLAY_DIM_TIMEOUT_MS,
		10 * 60 * 1000
	);
	const advancedPromptIdleMs = readPositiveNumber(
		publicEnv.PUBLIC_ADVANCED_PROMPT_IDLE_MS,
		30 * 1000
	);
	const advancedPanelIdleMs = readPositiveNumber(
		publicEnv.PUBLIC_ADVANCED_PANEL_IDLE_MS,
		5 * 60 * 1000
	);

	const acceptedAdvancedPatterns = readAdvancedPatterns(
		publicEnv.PUBLIC_ADVANCED_PATTERN,
		publicEnv.PUBLIC_ADVANCED_PIN
	);
	const advancedPatternConfigured = acceptedAdvancedPatterns.length > 0;
	const patternNodes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
	const wattageDebug = readBooleanFlag(publicEnv.PUBLIC_DEBUG_WATTAGE);

	export let data: PageData;

	let loadingCommandKey: string | null = null;
	let errorMsg = '';
	let advancedErrorMsg = '';
	let deviceStates = new Map<string, DeviceCommandKey>(
		Object.entries(data?.deviceStates ?? {}) as [string, DeviceCommandKey][]
	);
	let statusDeviceStates = new Map<string, DeviceCommandKey>();

	const primaryDevices = [...configuredPrimaryDevices].sort(
		(left, right) =>
			(left.pushNumber ?? Number.MAX_SAFE_INTEGER) - (right.pushNumber ?? Number.MAX_SAFE_INTEGER)
	);
	const primaryDeviceCount = primaryDevices.length;
	const allDevices = [...primaryDevices, ...advancedDevices];
	const deviceById = new Map(allDevices.map((device) => [device.id, device]));
	const statusDeviceIds = Array.from(
		new Set(
			allDevices
				.map((device) => device.statusdeviceid?.trim())
				.filter((deviceId): deviceId is string => isValidStatusDeviceId(deviceId))
		)
	);
	let initialStatusPendingIds = new Set(statusDeviceIds);
	const configurationDiagnostics: DiagnosticEntry[] = allDevices.flatMap((device) => {
		const issues = getDeviceConfigurationIssues(device);
		return issues.length > 0
			? [{ id: device.id, name: device.label, detail: issues.join(' · ') }]
			: [];
	});
	const triggerConfigurationDiagnostics: DiagnosticEntry[] = advancedTriggers
		.filter((trigger) => trigger.type !== 'placeholder' && !trigger.sceneId?.trim())
		.map((trigger) => ({
			id: trigger.id,
			name: trigger.label,
			detail: 'Scène-ID ontbreekt'
		}));
	const advancedControlCount = advancedDevices.length + advancedTriggers.length;

	const wattageRoomId = -1;
	let wattageLabel = `Room ${wattageRoomId}`;
	let wattageTotal = 0;
	let wattageDevices: WattageDeviceSummary[] = [];
	let wattageError = '';
	let wattageLoading = false;
	let wattageStale = false;
	let wattageUpdatedAt: number | null = null;
	let wattageInventory: {
		totalCount: number;
		onlineCount: number;
		offlineCount: number;
		unknownStatusCount: number;
		offlineDevices?: InventoryDevice[];
		unknownStatusDevices?: InventoryDevice[];
	} | null = null;
	let wattageSummary: {
		unavailableCount: number;
		notMeteredCount: number;
		meteredCount: number;
		unknownCapabilityCount: number;
		cachedCount: number;
		cloudCount: number;
		lanRpcCount: number;
		lanStatusCount: number;
	} | null = null;
	let topWattageDevices: WattageDeviceSummary[] = [];
	let topWattageMax = 1;
	let availableWattageMeasurements = 0;
	let diagnosticGroups: DiagnosticGroup[] = [];
	let diagnosticProblemCount = 0;
	let cacheMessage = '';
	let cacheClearing = false;
	let updateStatus: UpdateStatus | null = null;
	let updateChecking = false;
	let updateRunning = false;
	let updateMessage = '';
	let updatePhase: UpdatePhase = 'idle';
	let updateStartedAt = 0;
	let updateWasObservedRunning = false;
	let updatePollTimeout: ReturnType<typeof setTimeout> | null = null;

	let showAdvancedPrompt = false;
	let showAdvancedPanel = false;
	let advancedUnlocked = false;
	let advancedAccessError = '';
	let patternSequence: number[] = [];
	let patternActive = false;
	let patternStatus: 'idle' | 'success' | 'error' = 'idle';
	let activePointerId: number | null = null;
	let advancedIdleTimeout: ReturnType<typeof setTimeout> | null = null;
	let advancedPanelPinned = false;
	let displayDimTimeout: ReturnType<typeof setTimeout> | null = null;
	let displayDimmed = false;
	let stateStream: EventSource | null = null;
	let stateStreamReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	let loadingTriggerId: string | null = null;
	let energyTriggerError = '';
	let showEnergyTriggerConfirmation = false;
	let browserOnline = true;
	let cloudReachable = true;
	let connectivityChecked = false;
	let connectivityChecking = false;
	let connectivityInterval: ReturnType<typeof setInterval> | null = null;
	let touchscreenConnected: boolean | null = null;
	let hardwareChecking = false;
	let hardwareInterval: ReturnType<typeof setInterval> | null = null;
	let statusDeviceWarningVisible = false;
	let statusDeviceWarningTimeout: ReturnType<typeof setTimeout> | null = null;
	let unavailableStatusDeviceIds = new Set<string>();
	let initialStatusDisplayTimeout: ReturnType<typeof setTimeout> | null = null;
	let transientActiveUntilByDevice = new Map<string, number>();
	const transientActiveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

	const commandOrder: DeviceCommandKey[] = ['on', 'off'];

	const commandKey = (deviceId: string, command: DeviceCommandKey) => `${deviceId}:${command}`;
	const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
	const normalWattageRefreshMs = 5 * 60 * 1000;
	const fastWattageRefreshMs = 2 * 60 * 1000;
	const fastWattageWindowMs = 10 * 60 * 1000;
	const liveStatusRefreshMs = 5_000;
	const initialStatusDisplayMaxMs = 8_000;
	const statusDeviceWarningDurationMs = 7_000;
	const statusFollowupDelaysMs = [1200, 2500, 5000, 10000, 20000, 45000, 90000];
	const connectivityRefreshMs = 15000;
	const hardwareRefreshMs = 15000;
	const updatePollIntervalMs = 4000;
	const updatePollMaxMs = 35 * 60 * 1000;

	$: connectionOffline = connectivityChecked && (!browserOnline || !cloudReachable);

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
	$: diagnosticGroups = [
		{
			id: 'offline',
			label: 'Offline apparaten',
			entries: (wattageInventory?.offlineDevices ?? []).map((device) => ({
				id: device.deviceId,
				name: device.name,
				detail: device.ip ? `Cloud offline · ${device.ip}` : 'Cloud offline'
			}))
		},
		{
			id: 'cloud-unknown',
			label: 'Cloudstatus onbekend',
			entries: (wattageInventory?.unknownStatusDevices ?? []).map((device) => ({
				id: device.deviceId,
				name: device.name,
				detail: device.ip ? `Geen cloudstatus · ${device.ip}` : 'Geen cloudstatus'
			}))
		},
		{
			id: 'output-unknown',
			label: 'Schakelstatus onbekend',
			entries: wattageDevices
				.filter((device) => device.output === null)
				.map((device) => ({
					id: device.deviceId,
					name: device.name,
					detail: `${device.source ?? 'unknown'} · ${device.ip || 'geen IP-adres'}`
				}))
		},
		{
			id: 'unavailable',
			label: 'Metingen niet beschikbaar',
			entries: wattageDevices
				.filter((device) => device.state === 'unavailable')
				.map((device) => ({
					id: device.deviceId,
					name: device.name,
					detail: `Geen actuele meting · ${device.ip || 'geen IP-adres'}`
				}))
		},
		{
			id: 'fallback',
			label: 'LAN fallback actief',
			entries: wattageDevices
				.filter((device) => device.source === 'cloud' || device.source === 'cached')
				.map((device) => ({
					id: device.deviceId,
					name: device.name,
					detail:
						device.source === 'cached'
							? 'Tijdelijk oude meting gebruikt'
							: 'Cloudmeting gebruikt omdat LAN niet antwoordde'
				}))
		},
		{
			id: 'configuration',
			label: 'Configuratieproblemen',
			entries: [...configurationDiagnostics, ...triggerConfigurationDiagnostics]
		}
	];
	$: diagnosticProblemCount = diagnosticGroups.reduce(
		(total, group) => total + group.entries.length,
		0
	);

	function clearAdvancedIdleTimer() {
		if (advancedIdleTimeout) {
			clearTimeout(advancedIdleTimeout);
			advancedIdleTimeout = null;
		}
	}

	function startAdvancedIdleTimer(mode: 'prompt' | 'panel') {
		clearAdvancedIdleTimer();
		if (mode === 'panel' && (advancedPanelPinned || updateRunning)) return;
		const timeoutMs = mode === 'panel' ? advancedPanelIdleMs : advancedPromptIdleMs;
		advancedIdleTimeout = setTimeout(() => {
			if (mode === 'prompt' && showAdvancedPrompt) {
				closeAdvancedPrompt();
			} else if (mode === 'panel' && showAdvancedPanel) {
				closeAdvancedPanel();
			}
		}, timeoutMs);
	}

	function markAdvancedActivity() {
		if (showAdvancedPanel) {
			startAdvancedIdleTimer('panel');
		} else if (showAdvancedPrompt) {
			startAdvancedIdleTimer('prompt');
		}
	}

	function resumeAdvancedIdleTimerAfterUpdate() {
		if (showAdvancedPanel && !advancedPanelPinned) {
			startAdvancedIdleTimer('panel');
		}
	}

	function toggleAdvancedPanelPin() {
		advancedPanelPinned = !advancedPanelPinned;
		if (advancedPanelPinned) {
			clearAdvancedIdleTimer();
		} else {
			startAdvancedIdleTimer('panel');
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
		if (displayDimmed) return;
		displayDimmed = false;
		scheduleDisplayDim();
	}

	function wakeDisplay(event?: Event) {
		event?.preventDefault();
		event?.stopPropagation();
		displayDimmed = false;
		scheduleDisplayDim();
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
				const message =
					typeof payload.message === 'string' ? payload.message : 'Kon vermogen niet ophalen';
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
					offlineDevices?: InventoryDevice[];
					unknownStatusDevices?: InventoryDevice[];
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
	let statusAutomaticRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
	let statusRefreshLoading = false;
	let statusFollowupTimeouts: ReturnType<typeof setTimeout>[] = [];
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
		void refreshStatusDevices();
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

	function scheduleAutomaticStatusRefresh() {
		if (typeof window === 'undefined' || statusDeviceIds.length === 0) return;
		if (statusAutomaticRefreshTimeout) {
			clearTimeout(statusAutomaticRefreshTimeout);
		}

		statusAutomaticRefreshTimeout = setTimeout(() => {
			statusAutomaticRefreshTimeout = null;
			void refreshStatusDevices();
		}, liveStatusRefreshMs);
	}

	function applyStatusDeviceStates(
		states: Record<string, { lastCommand: DeviceCommandKey }>,
		unavailableIds: string[] = []
	) {
		const nextStatusStates = new Map(statusDeviceStates);
		const nextDeviceStates = new Map(deviceStates);
		const nextUnavailableIds = new Set(unavailableStatusDeviceIds);
		const hasNewUnavailableDevice = unavailableIds.some(
			(id) => !unavailableStatusDeviceIds.has(id)
		);

		unavailableIds.forEach((id) => {
			nextStatusStates.delete(id);
			nextUnavailableIds.add(id);
		});

		Object.entries(states).forEach(([id, entry]) => {
			if (entry?.lastCommand === 'on' || entry?.lastCommand === 'off') {
				nextStatusStates.set(id, entry.lastCommand);
				nextDeviceStates.set(id, entry.lastCommand);
				nextUnavailableIds.delete(id);
			}
		});

		statusDeviceStates = nextStatusStates;
		deviceStates = nextDeviceStates;
		unavailableStatusDeviceIds = nextUnavailableIds;

		if (hasNewUnavailableDevice) {
			showStatusDeviceWarning();
		}
	}

	function showStatusDeviceWarning() {
		if (statusDeviceWarningTimeout) {
			clearTimeout(statusDeviceWarningTimeout);
		}
		statusDeviceWarningVisible = true;
		statusDeviceWarningTimeout = setTimeout(() => {
			statusDeviceWarningVisible = false;
			statusDeviceWarningTimeout = null;
		}, statusDeviceWarningDurationMs);
	}

	async function refreshStatusDevices(ids = statusDeviceIds) {
		const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
		if (uniqueIds.length === 0 || statusRefreshLoading) return;

		statusRefreshLoading = true;
		try {
			const params = new URLSearchParams({ ids: uniqueIds.join(',') });
			const res = await fetch(`/api/device-output?${params.toString()}`, { cache: 'no-store' });
			if (!res.ok) {
				applyStatusDeviceStates({}, uniqueIds);
				return;
			}

			const payload = (await res.json()) as {
				ok: boolean;
				states: Record<string, { lastCommand: DeviceCommandKey }>;
				errors?: Record<string, string>;
			};
			if (!payload?.ok || !payload.states) {
				applyStatusDeviceStates({}, uniqueIds);
				return;
			}
			applyStatusDeviceStates(payload.states, Object.keys(payload.errors ?? {}));
		} catch {
			applyStatusDeviceStates({}, uniqueIds);
		} finally {
			const nextPendingIds = new Set(initialStatusPendingIds);
			uniqueIds.forEach((id) => nextPendingIds.delete(id));
			initialStatusPendingIds = nextPendingIds;
			if (nextPendingIds.size === 0 && initialStatusDisplayTimeout) {
				clearTimeout(initialStatusDisplayTimeout);
				initialStatusDisplayTimeout = null;
			}
			statusRefreshLoading = false;
			scheduleAutomaticStatusRefresh();
		}
	}

	function clearStatusFollowups() {
		statusFollowupTimeouts.forEach((timeout) => clearTimeout(timeout));
		statusFollowupTimeouts = [];
	}

	function startStatusFollowup(statusDeviceId: string) {
		const cleanDeviceId = statusDeviceId.trim();
		if (!cleanDeviceId) return;
		clearStatusFollowups();

		statusFollowupTimeouts = statusFollowupDelaysMs.map((delay) =>
			setTimeout(() => {
				void refreshStatusDevices([cleanDeviceId]);
			}, delay)
		);
	}

	function resolveCardStatus(
		device: ShellyDevice,
		knownDeviceStates: Map<string, DeviceCommandKey>,
		knownStatusDeviceStates: Map<string, DeviceCommandKey>
	) {
		const statusDeviceId = device.statusdeviceid?.trim();
		if (statusDeviceId && isValidStatusDeviceId(statusDeviceId)) {
			return (
				knownStatusDeviceStates.get(statusDeviceId) ?? knownDeviceStates.get(device.id) ?? 'off'
			);
		}
		if (device.type === 'Scene') return null;

		return knownDeviceStates.get(device.id) ?? null;
	}

	function isInitialStatusPending(device: ShellyDevice) {
		const statusDeviceId = device.statusdeviceid?.trim();
		return Boolean(statusDeviceId && initialStatusPendingIds.has(statusDeviceId));
	}

	function isTransientDeviceActive(deviceId: string) {
		return (transientActiveUntilByDevice.get(deviceId) ?? 0) > Date.now();
	}

	function setTransientDeviceActive(deviceId: string, activeUntil: number) {
		const durationMs = Math.max(0, activeUntil - Date.now());
		if (durationMs === 0) return;

		const existingTimeout = transientActiveTimeouts.get(deviceId);
		if (existingTimeout) clearTimeout(existingTimeout);

		const nextActiveUntil = new Map(transientActiveUntilByDevice);
		nextActiveUntil.set(deviceId, activeUntil);
		transientActiveUntilByDevice = nextActiveUntil;

		const timeout = setTimeout(() => {
			const next = new Map(transientActiveUntilByDevice);
			next.delete(deviceId);
			transientActiveUntilByDevice = next;
			transientActiveTimeouts.delete(deviceId);
		}, durationMs);
		transientActiveTimeouts.set(deviceId, timeout);
	}

	async function handlePress(
		deviceId: string,
		command: DeviceCommandKey,
		options: PressOptions = {}
	): Promise<void> {
		const device = deviceById.get(deviceId);
		if (!device || !isDeviceCommandConfigured(device, command)) {
			errorMsg = 'Deze actie is nog niet ingesteld.';
			return;
		}
		const key = commandKey(deviceId, command);
		loadingCommandKey = key;
		errorMsg = '';
		let succeeded = false;
		try {
			const response = await triggerDeviceCommand(deviceId, command);
			const statusDeviceId = device.statusdeviceid?.trim();
			if (!options.stateless) {
				setDeviceState(deviceId, command);
			} else if (
				device.activeDurationMs &&
				Number.isFinite(response.activeUntil) &&
				Number(response.activeUntil) > Date.now()
			) {
				setTransientDeviceActive(deviceId, Number(response.activeUntil));
			}
			if (statusDeviceId) {
				startStatusFollowup(statusDeviceId);
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

		if (statusDeviceIds.includes(deviceId)) {
			const nextStatusStates = new Map(statusDeviceStates);
			nextStatusStates.set(deviceId, command);
			statusDeviceStates = nextStatusStates;
		}
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
		} catch {}
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
			} catch {}
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
			} catch {}
		});

		stream.addEventListener('error', () => {
			stream.close();
			stateStream = null;
			if (stateStreamReconnectTimeout) clearTimeout(stateStreamReconnectTimeout);
			stateStreamReconnectTimeout = setTimeout(() => {
				stateStreamReconnectTimeout = null;
				startStateStream();
			}, 3000);
		});

		stateStream = stream;
	}

	function openAdvancedAccess() {
		cacheMessage = '';
		if (advancedUnlocked) {
			advancedPanelPinned = false;
			showAdvancedPanel = true;
			markAdvancedActivity();
			void checkGitUpdate();
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
		advancedPanelPinned = false;
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

		if (acceptedAdvancedPatterns.includes(submitted)) {
			advancedUnlocked = true;
			advancedPanelPinned = false;
			showAdvancedPrompt = false;
			advancedAccessError = '';
			patternStatus = 'success';
			showAdvancedPanel = true;
			markAdvancedActivity();
			void checkGitUpdate();
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

	function updateStatusText() {
		if (updatePhase === 'checking') return 'Controleren op updates…';
		if (updatePhase === 'starting') return 'Update wordt gestart…';
		if (updatePhase === 'running') {
			return updateMessage || 'Update wordt geïnstalleerd. Dit kan enkele minuten duren.';
		}
		if (updatePhase === 'success') return updateMessage || 'Update voltooid.';
		if (updatePhase === 'error') return updateMessage || 'Update mislukt.';
		if (updatePhase === 'blocked') {
			return 'Update gevonden, maar niet automatisch veilig te installeren.';
		}
		if (updatePhase === 'available') return 'Nieuwe update beschikbaar.';
		if (!updateStatus) return 'Nog niet gecontroleerd.';
		if (!updateStatus.ok) return updateStatus.message ?? 'Update status niet beschikbaar.';
		return 'Deze kiosk is up-to-date.';
	}

	function clearUpdatePoll() {
		if (!updatePollTimeout) return;
		clearTimeout(updatePollTimeout);
		updatePollTimeout = null;
	}

	function scheduleUpdatePoll(delay = updatePollIntervalMs) {
		clearUpdatePoll();
		updatePollTimeout = setTimeout(() => {
			updatePollTimeout = null;
			void pollUpdateProgress();
		}, delay);
	}

	function serviceFailed(status: UpdateStatus) {
		const result = status.service?.result?.toLowerCase();
		const activeState = status.service?.activeState?.toLowerCase();
		return activeState === 'failed' || Boolean(result && !['success', 'unknown'].includes(result));
	}

	function finishUpdateWithError(message: string) {
		clearUpdatePoll();
		updateRunning = false;
		updatePhase = 'error';
		updateMessage = message;
		resumeAdvancedIdleTimerAfterUpdate();
	}

	async function pollUpdateProgress() {
		if (!updateRunning) return;
		if (Date.now() - updateStartedAt > updatePollMaxMs) {
			finishUpdateWithError('De update duurt te lang. Controleer de update opnieuw.');
			return;
		}

		try {
			const res = await fetch('/api/update', { cache: 'no-store' });
			const payload = (await res.json().catch(() => ({}))) as UpdateStatus;
			if (!res.ok || !payload.ok) {
				updateMessage = 'De kiosk herstart mogelijk. Verbinding wordt opnieuw geprobeerd…';
				scheduleUpdatePoll();
				return;
			}

			updateStatus = payload;
			if (payload.updating) {
				clearAdvancedIdleTimer();
				updateWasObservedRunning = true;
				updatePhase = 'running';
				updateMessage = 'Update wordt geïnstalleerd. Laat de ODROID aan staan.';
				scheduleUpdatePoll();
				return;
			}

			if (payload.updateAvailable === false) {
				clearUpdatePoll();
				updateRunning = false;
				updatePhase = 'success';
				updateMessage = payload.currentShort
					? `Update voltooid: versie ${payload.currentShort}.`
					: 'Update voltooid.';
				resumeAdvancedIdleTimerAfterUpdate();
				return;
			}

			if (
				serviceFailed(payload) &&
				(updateWasObservedRunning || Date.now() - updateStartedAt > 10_000)
			) {
				finishUpdateWithError('De update is mislukt. Probeer opnieuw of controleer de logs.');
				return;
			}

			updatePhase = updateWasObservedRunning ? 'running' : 'starting';
			updateMessage = updateWasObservedRunning
				? 'Update wordt afgerond. Wachten op de nieuwe versie…'
				: 'Update wordt gestart. Nogmaals drukken is niet nodig.';
			scheduleUpdatePoll();
		} catch {
			updateMessage = 'De kiosk herstart mogelijk. Verbinding wordt opnieuw geprobeerd…';
			scheduleUpdatePoll();
		}
	}

	async function checkGitUpdate() {
		if (updateChecking || updateRunning) return;
		updateChecking = true;
		updateMessage = '';
		updatePhase = 'checking';
		try {
			const res = await fetch('/api/update', { cache: 'no-store' });
			const payload = (await res.json().catch(() => ({}))) as UpdateStatus;
			updateStatus = payload;
			if (!res.ok || !payload.ok) {
				updateMessage = payload.message ?? 'Kon update status niet ophalen';
				updatePhase = 'error';
			} else if (payload.updating) {
				updateRunning = true;
				clearAdvancedIdleTimer();
				updateStartedAt = Date.now();
				updateWasObservedRunning = true;
				updatePhase = 'running';
				updateMessage = 'Update wordt geïnstalleerd. Laat de ODROID aan staan.';
				scheduleUpdatePoll();
			} else if (payload.updateAvailable && payload.fastForward === false) {
				updatePhase = 'blocked';
			} else if (payload.updateAvailable) {
				updatePhase = 'available';
			} else {
				updatePhase = 'idle';
			}
		} catch (error) {
			updateStatus = {
				ok: false,
				message: error instanceof Error ? error.message : 'Update check mislukt'
			};
			updateMessage = updateStatus.message ?? '';
			updatePhase = 'error';
		} finally {
			updateChecking = false;
		}
	}

	async function runGitUpdate() {
		if (updateRunning) return;
		clearUpdatePoll();
		updateRunning = true;
		clearAdvancedIdleTimer();
		updateStartedAt = Date.now();
		updateWasObservedRunning = false;
		updatePhase = 'starting';
		updateMessage = '';
		try {
			const res = await fetch('/api/update', { method: 'POST' });
			const payload = (await res.json().catch(() => ({}))) as UpdateStatus;
			if (!res.ok || !payload.ok) {
				updateStatus = payload;
				finishUpdateWithError(payload.message ?? 'Kon update niet starten');
			} else if (payload.updateStarted === false) {
				updateStatus = payload;
				updateRunning = false;
				updatePhase = 'success';
				updateMessage = 'De kiosk was al up-to-date.';
				resumeAdvancedIdleTimerAfterUpdate();
			} else {
				updatePhase = 'running';
				updateMessage = 'Update wordt geïnstalleerd. Laat de ODROID aan staan.';
				scheduleUpdatePoll(1500);
			}
		} catch (error) {
			finishUpdateWithError(error instanceof Error ? error.message : 'Kon update niet starten');
		}
	}

	const preventContextMenu = (evt: Event) => evt.preventDefault();

	async function checkConnectivity() {
		if (connectivityChecking || typeof navigator === 'undefined') return;

		browserOnline = navigator.onLine;
		if (!browserOnline) {
			cloudReachable = false;
			connectivityChecked = true;
			return;
		}

		connectivityChecking = true;
		try {
			const res = await fetch('/api/connectivity', { cache: 'no-store' });
			const payload = (await res.json().catch(() => null)) as { online?: boolean } | null;
			cloudReachable = res.ok && payload?.online === true;
		} catch {
			cloudReachable = false;
		} finally {
			connectivityChecked = true;
			connectivityChecking = false;
		}
	}

	function handleBrowserOnline() {
		browserOnline = true;
		void checkConnectivity();
	}

	function handleBrowserOffline() {
		browserOnline = false;
		cloudReachable = false;
		connectivityChecked = true;
	}

	async function checkHardware() {
		if (hardwareChecking) return;
		hardwareChecking = true;
		try {
			const res = await fetch('/api/hardware', { cache: 'no-store' });
			const payload = (await res.json().catch(() => null)) as {
				ok?: boolean;
				touchscreen?: { connected?: boolean };
			} | null;
			if (res.ok && payload?.ok && typeof payload.touchscreen?.connected === 'boolean') {
				touchscreenConnected = payload.touchscreen.connected;
			}
		} catch {
			// Keep the last known hardware state when host diagnostics are unavailable.
		} finally {
			hardwareChecking = false;
		}
	}

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

	async function handleEnergyTriggerPress() {
		loadingTriggerId = energyDevicesTrigger.id;
		energyTriggerError = '';
		try {
			await triggerAction(energyDevicesTrigger.id);
			requestWattageRefresh();
		} catch (err) {
			energyTriggerError = err instanceof Error ? err.message : 'Scène kon niet worden uitgevoerd';
		} finally {
			loadingTriggerId = null;
		}
	}

	function openEnergyTriggerConfirmation() {
		energyTriggerError = '';
		showEnergyTriggerConfirmation = true;
	}

	function cancelEnergyTriggerConfirmation() {
		showEnergyTriggerConfirmation = false;
	}

	async function confirmEnergyTrigger() {
		showEnergyTriggerConfirmation = false;
		await handleEnergyTriggerPress();
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			window.addEventListener('contextmenu', preventContextMenu);
			window.addEventListener('pointerdown', markDisplayActivity, { passive: true });
			window.addEventListener('keydown', markDisplayActivity);
			window.addEventListener('online', handleBrowserOnline);
			window.addEventListener('offline', handleBrowserOffline);
			browserOnline = navigator.onLine;
			if (!browserOnline) {
				handleBrowserOffline();
			}
			void checkConnectivity();
			connectivityInterval = setInterval(() => void checkConnectivity(), connectivityRefreshMs);
			void checkHardware();
			hardwareInterval = setInterval(() => void checkHardware(), hardwareRefreshMs);
			scheduleDisplayDim();
			initialStatusDisplayTimeout = setTimeout(() => {
				initialStatusPendingIds = new Set();
				initialStatusDisplayTimeout = null;
			}, initialStatusDisplayMaxMs);
			void refreshStatusDevices();
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
			window.removeEventListener('online', handleBrowserOnline);
			window.removeEventListener('offline', handleBrowserOffline);
		}
		if (connectivityInterval) {
			clearInterval(connectivityInterval);
			connectivityInterval = null;
		}
		if (hardwareInterval) {
			clearInterval(hardwareInterval);
			hardwareInterval = null;
		}
		if (statusDeviceWarningTimeout) {
			clearTimeout(statusDeviceWarningTimeout);
			statusDeviceWarningTimeout = null;
		}
		if (initialStatusDisplayTimeout) {
			clearTimeout(initialStatusDisplayTimeout);
			initialStatusDisplayTimeout = null;
		}
		transientActiveTimeouts.forEach((timeout) => clearTimeout(timeout));
		transientActiveTimeouts.clear();
		if (wattageRefreshTimeout) {
			clearTimeout(wattageRefreshTimeout);
		}
		if (wattageAutomaticRefreshTimeout) {
			clearTimeout(wattageAutomaticRefreshTimeout);
		}
		if (statusAutomaticRefreshTimeout) {
			clearTimeout(statusAutomaticRefreshTimeout);
		}
		clearStatusFollowups();
		if (stateStream) {
			stateStream.close();
			stateStream = null;
		}
		if (stateStreamReconnectTimeout) {
			clearTimeout(stateStreamReconnectTimeout);
			stateStreamReconnectTimeout = null;
		}
		clearUpdatePoll();
		clearAdvancedIdleTimer();
		clearDisplayDimTimer();
	});
</script>

{#if updatePhase === 'starting' || updatePhase === 'running'}
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

{#if statusDeviceWarningVisible}
	<div
		class="fixed top-4 right-4 z-[90] flex max-w-sm items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm transition-opacity duration-150"
		role="status"
		aria-live="polite"
	>
		<TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
		<div>
			<p class="font-semibold">Pushknoppenpaneel niet gevonden</p>
			<p class="mt-1 text-sm text-amber-900">
				De actuele stand kan niet worden gecontroleerd. De bediening is daardoor minder betrouwbaar.
			</p>
		</div>
	</div>
{/if}

<main class="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-900">
	<header class="border-b border-slate-300 bg-white px-6 py-4">
		<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
			<div>
				<h1 class="text-2xl font-semibold text-slate-900">Shelly bediening</h1>
			</div>
			<div class="flex flex-wrap items-center gap-3"></div>
		</div>
	</header>

	{#if connectionOffline}
		<div
			class="flex items-center justify-center gap-3 bg-red-700 px-6 py-3 text-white"
			role="status"
			aria-live="assertive"
		>
			<WifiOff class="h-6 w-6 shrink-0" aria-hidden="true" />
			<div>
				<p class="text-base font-bold">Geen internetverbinding</p>
				<p class="text-sm text-red-100">Shelly-bediening is tijdelijk niet beschikbaar.</p>
			</div>
		</div>
	{/if}

	{#if touchscreenConnected === false}
		<div
			class="flex items-center justify-center gap-3 bg-amber-600 px-6 py-3 text-white"
			role="status"
			aria-live="assertive"
		>
			<TouchpadOff class="h-6 w-6 shrink-0" aria-hidden="true" />
			<div>
				<p class="text-base font-bold">Touchscreen niet gevonden</p>
				<p class="text-sm text-amber-50">Bediening via aanraking is niet beschikbaar.</p>
			</div>
		</div>
	{/if}

	<div class="flex min-h-0 flex-1 gap-4 overflow-hidden px-4 pt-4 pb-4">
		<section
			class="flex w-[26rem] shrink-0 flex-col rounded-lg border border-slate-300 bg-white p-5"
		>
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-sm font-semibold text-slate-700">Energie en apparaten</p>
					<h2 class="mt-1 text-xl font-semibold text-slate-900">{wattageLabel}</h2>
					<p
						class={`mt-1 text-xs ${wattageStale ? 'font-semibold text-amber-700' : 'text-slate-500'}`}
					>
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
				<p class="text-sm font-medium text-slate-600">Huidig gemeten vermogen</p>
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

			<div class="mt-4">
				<button
					type="button"
					class="relative flex w-full items-center justify-center rounded-lg border border-red-800 bg-red-700 px-5 py-5 text-lg font-bold text-white transition-colors duration-150 hover:bg-red-800 disabled:cursor-wait disabled:opacity-70"
					disabled={loadingTriggerId === energyDevicesTrigger.id}
					on:click={openEnergyTriggerConfirmation}
				>
					{#if loadingTriggerId === energyDevicesTrigger.id}
						Bezig…
					{:else}
						{energyDevicesTrigger.label}
					{/if}
				</button>
				{#if energyTriggerError}
					<p class="mt-2 text-sm font-semibold text-red-700">{energyTriggerError}</p>
				{/if}
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
										<span class="w-4 shrink-0 text-xs font-semibold text-slate-400"
											>{index + 1}</span
										>
										<span class="truncate font-medium text-slate-700">{device.name}</span>
									</div>
									<span class="shrink-0 font-semibold text-slate-900"
										>{formatWatts(device.watts)}</span
									>
								</div>
								<div class="mt-1.5 ml-6 h-1.5 overflow-hidden rounded-sm bg-slate-100">
									<div
										class="h-full bg-emerald-600 transition-[width] duration-500"
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
				<p
					class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
				>
					{wattageStale
						? 'Vernieuwen mislukt. De vorige gegevens blijven zichtbaar.'
						: wattageError}
				</p>
			{/if}

			<div class="mt-auto pt-4">
				<button
					type="button"
					class="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200"
					on:click={openAdvancedAccess}
				>
					<span>Geavanceerde bediening</span>
				</button>
			</div>
		</section>

		<section class="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-300 bg-white p-4">
			<header class="mb-4 flex items-center justify-between">
				<div>
					<h2 class="text-2xl font-semibold text-slate-900">Bediening</h2>
				</div>
				<span class="text-sm text-slate-500">{primaryDeviceCount} knoppen</span>
			</header>
			{#if errorMsg}
				<p
					class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
				>
					{errorMsg}
				</p>
			{/if}
			<div class="grid h-full flex-1 grid-flow-row grid-cols-3 grid-rows-3 gap-6 pr-1 pb-2">
				{#each primaryDevices as device (device.id)}
					<DeviceCard
						{device}
						{commandOrder}
						{commandKey}
						{commandLabel}
						{resolveToggleCommand}
						{loadingCommandKey}
						statusPending={isInitialStatusPending(device)}
						transientActive={isTransientDeviceActive(device.id)}
						initialStatus={resolveCardStatus(device, deviceStates, statusDeviceStates)}
						on:command={({ detail }) =>
							handlePress(detail.deviceId, detail.command, { stateless: device.stateless })}
					/>
				{/each}
			</div>
		</section>
	</div>

	{#if displayDimmed}
		<button
			type="button"
			class="fixed inset-0 z-[70] cursor-default bg-black"
			aria-label="Scherm actief maken"
			on:click={wakeDisplay}
			on:keydown={wakeDisplay}
		></button>
	{/if}
</main>

{#if showEnergyTriggerConfirmation}
	<div
		class="fixed inset-0 z-[80] flex items-center justify-center px-6"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="energy-confirmation-title"
	>
		<button
			type="button"
			class="absolute inset-0 bg-slate-950/75"
			aria-label="Nee"
			on:click={cancelEnergyTriggerConfirmation}
		></button>
		<div class="relative w-full max-w-md rounded-lg border border-slate-300 bg-white p-6">
			<h2 id="energy-confirmation-title" class="text-xl font-semibold text-slate-900">
				Alles uitschakelen?
			</h2>
			<p class="mt-3 text-base text-slate-700">Ben je bevoegd om deze actie uit te voeren?</p>
			<div class="mt-6 grid grid-cols-2 gap-3">
				<button
					type="button"
					class="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-800 hover:bg-slate-100"
					on:click={cancelEnergyTriggerConfirmation}
				>
					Nee
				</button>
				<button
					type="button"
					class="rounded-lg border border-red-800 bg-red-700 px-4 py-3 text-base font-bold text-white hover:bg-red-800"
					on:click={confirmEnergyTrigger}
				>
					Ja
				</button>
			</div>
		</div>
	</div>
{/if}

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
				<p
					class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold tracking-wide text-amber-800 uppercase"
				>
					Stel PUBLIC_ADVANCED_PATTERN in je .env bestand in om toegang te krijgen.
				</p>
			{/if}
			{#if advancedAccessError}
				<p
					class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold tracking-wide text-red-700 uppercase"
				>
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
					const target = document.elementFromPoint(
						event.clientX,
						event.clientY
					) as HTMLElement | null;
					const nodeValue = target?.dataset?.node;
					if (nodeValue !== undefined) {
						extendPattern(Number(nodeValue), event);
					}
				}}
			>
				<div class="grid grid-cols-3 justify-items-center gap-6 select-none">
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
								<span
									class="pointer-events-none absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-emerald-600 shadow-md shadow-emerald-100"
								>
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
			<header
				class="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
			>
				<div class="space-y-1">
					<h2 class="text-2xl font-semibold tracking-tight text-slate-900">Advanced Controls</h2>
					<p class="text-sm text-slate-600">
						Geavanceerde bedieningselementen voor gemachtigde gebruikers.
					</p>
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors duration-150 ${
							advancedPanelPinned
								? 'border-slate-800 bg-slate-800 text-white'
								: 'border-slate-300 text-slate-700 hover:bg-slate-100'
						}`}
						aria-pressed={advancedPanelPinned}
						aria-label={advancedPanelPinned
							? 'Automatisch sluiten weer inschakelen'
							: 'Paneel vastzetten'}
						title={advancedPanelPinned
							? 'Vastgezet: automatisch sluiten staat uit'
							: 'Vastzetten zodat het paneel open blijft'}
						on:click={toggleAdvancedPanelPin}
					>
						<Pin class="h-5 w-5" />
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-100"
						on:click={closeAdvancedPanel}
					>
						Sluiten
					</button>
				</div>
			</header>
			<div class="flex min-h-0 flex-1 flex-col gap-6 px-6 py-6 lg:flex-row">
				<section class="flex min-h-0 flex-1 flex-col">
					<div class="mb-3 flex items-center justify-between">
						<h3 class="text-base font-semibold text-slate-900">Tijdelijke knoppen</h3>
						<span class="text-sm text-slate-500">{advancedControlCount} knoppen</span>
					</div>
					{#if advancedErrorMsg}
						<p
							class="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
						>
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
						{#if advancedControlCount === 0}
							<p class="text-sm text-slate-600">Geen tijdelijke knoppen ingesteld.</p>
						{:else}
							<div class="grid auto-rows-fr grid-cols-1 gap-4 pb-4 md:grid-cols-2">
								{#each advancedDevices as device (device.id)}
									<DeviceCard
										{device}
										{commandOrder}
										{commandKey}
										{commandLabel}
										{resolveToggleCommand}
										{loadingCommandKey}
										statusPending={isInitialStatusPending(device)}
										transientActive={isTransientDeviceActive(device.id)}
										initialStatus={resolveCardStatus(device, deviceStates, statusDeviceStates)}
										on:command={({ detail }) =>
											handlePress(detail.deviceId, detail.command, {
												stateless: device.stateless
											})}
									/>
								{/each}
								{#each advancedTriggers as trigger (trigger.id)}
									<TriggerCard
										{trigger}
										{loadingTriggerId}
										on:trigger={({ detail }) => handleTriggerPress(detail.triggerId)}
									/>
								{/each}
							</div>
						{/if}
					</div>
				</section>

				<aside class="w-full space-y-4 overflow-y-auto pr-1 lg:w-[400px] lg:flex-shrink-0">
					<div class="rounded-lg border border-slate-300 bg-white p-4">
						<h3 class="text-base font-semibold text-slate-900">Systeem</h3>
						<div class="mt-3 grid gap-4">
							<div class="border-t border-slate-200 pt-3">
								<div class="flex items-center justify-between gap-3">
									<p class="text-sm font-semibold text-slate-800">Software-update</p>
									<button
										type="button"
										class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
										on:click={checkGitUpdate}
										disabled={updateChecking || updateRunning}
									>
										<RefreshCw class={`h-4 w-4 ${updateChecking ? 'animate-spin' : ''}`} />
										{updateChecking ? 'Controleren…' : 'Controleren'}
									</button>
								</div>
								<p
									class={`mt-2 text-sm ${
										updatePhase === 'success'
											? 'font-semibold text-emerald-700'
											: updatePhase === 'error'
												? 'font-semibold text-red-700'
												: updatePhase === 'blocked'
													? 'font-semibold text-amber-700'
													: 'text-slate-600'
									}`}
								>
									{updateStatusText()}
								</p>
								{#if updateStatus?.currentShort || updateStatus?.targetShort}
									<p class="mt-2 font-mono text-xs text-slate-500">
										{updateStatus.currentShort ?? 'onbekend'} → {updateStatus.targetShort ??
											'onbekend'}
									</p>
								{/if}

								{#if updatePhase === 'starting' || updatePhase === 'running'}
									<button
										type="button"
										class="mt-3 flex w-full cursor-wait items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-700 px-4 py-3 text-sm font-semibold text-white"
										disabled
									>
										<RefreshCw class="h-4 w-4 animate-spin" />
										{updatePhase === 'starting' ? 'Update starten…' : 'Update installeren…'}
									</button>
								{:else if updatePhase === 'available' || (updatePhase === 'error' && updateStatus?.updateAvailable && updateStatus.fastForward !== false)}
									<button
										type="button"
										class="mt-3 w-full rounded-lg bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-900 disabled:opacity-60"
										on:click={runGitUpdate}
										disabled={updateChecking}
									>
										{updatePhase === 'error' ? 'Opnieuw proberen' : 'Update installeren'}
									</button>
								{/if}
							</div>
							<button
								type="button"
								class="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-100 disabled:opacity-60"
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
								<p
									class="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase"
								>
									{cacheMessage}
								</p>
							{/if}
						</div>
					</div>

					<div class="rounded-lg border border-slate-300 bg-white p-4">
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-base font-semibold text-slate-900">Apparaatproblemen</h3>
							<span
								class={`text-sm font-semibold ${diagnosticProblemCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
							>
								{diagnosticProblemCount} meldingen
							</span>
						</div>
						<div class="mt-3 border-t border-slate-200">
							{#each diagnosticGroups as group (group.id)}
								<details class="border-b border-slate-200">
									<summary
										class="flex cursor-pointer items-center justify-between gap-3 py-3 text-sm font-semibold text-slate-700"
									>
										<span>{group.label}</span>
										<span class={group.entries.length > 0 ? 'text-amber-700' : 'text-slate-400'}>
											{group.entries.length}
										</span>
									</summary>
									{#if group.entries.length === 0}
										<p class="pb-3 text-sm text-slate-500">Geen apparaten.</p>
									{:else}
										<ul class="space-y-3 pb-3">
											{#each group.entries as entry (`${group.id}:${entry.id}`)}
												<li>
													<p class="text-sm font-semibold text-slate-800">{entry.name}</p>
													<p class="mt-0.5 text-xs break-words text-slate-500">{entry.detail}</p>
												</li>
											{/each}
										</ul>
									{/if}
								</details>
							{/each}
						</div>
					</div>

					<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<p class="text-xs font-semibold tracking-wide text-slate-500 uppercase">
							Wattage diagnostiek
						</p>
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
							<summary
								class="cursor-pointer text-xs font-semibold tracking-wide text-slate-500 uppercase"
							>
								Wattage debug lijst
							</summary>
							{#if wattageSummary}
								<p class="mt-3 text-xs text-slate-400">
									RPC {wattageSummary.lanRpcCount} · Status {wattageSummary.lanStatusCount} · Cache {wattageSummary.cachedCount}
									· Cloud {wattageSummary.cloudCount}
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
												{device.source ?? 'unknown'} · {device.capability ?? 'unknown'} · {formatWatts(
													device.watts
												)}
											</span>
										</div>
									{/each}
								</div>
							{/if}
						</details>
					{/if}
				</aside>
			</div>
			<footer
				class="shrink-0 border-t border-slate-200 px-6 py-2 text-right text-xs text-slate-500"
			>
				© 2026 Nick Esselman en Kennemer Lyceum Haarlem. Alle rechten voorbehouden.
			</footer>
		</div>
	</div>
{/if}
