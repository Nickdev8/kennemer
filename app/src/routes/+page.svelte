<script lang="ts">
	import { resolveCardStatus } from '$lib/dashboard/device-status';
	import { createPollingGroup } from '$lib/dashboard/polling';
	import { homeGridPosition } from '$lib/config/home-grid';
	import { onDestroy, onMount } from 'svelte';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import EnergyPanel from '$lib/components/energy-panel.svelte';
	import DebugInformation from '$lib/components/debug-information.svelte';
	import AdvancedInformation from '$lib/components/advanced-information.svelte';
	import UpdateProgress from '$lib/components/update-progress.svelte';
	import TabSelector from '$lib/components/tab-selector.svelte';
	import AdvancedAccess from '$lib/components/advanced-access.svelte';
	import BellManager from '$lib/components/bell-manager.svelte';
	import ShellyBrowser from '$lib/components/shelly-browser.svelte';
	import { controlPages } from '$lib/dashboard/control-layout';
	import AdvancedPanel from '$lib/components/advanced-panel.svelte';
	import ControlCard from '$lib/components/control-card.svelte';
	import VacationStatus from '$lib/components/vacation-status.svelte';
	import SceneIdEditor from '$lib/components/scene-id-editor.svelte';
	import { devices } from '$lib/config/devices';
	import { home } from '$lib/config/home';
	import { advancedControls as configuredAdvancedControls } from '$lib/config/advanced';
	import {
		energyDevicesTrigger as defaultEnergyDevicesTrigger,
		triggers
	} from '$lib/config/triggers';
	import { env as publicEnv } from '$env/dynamic/public';
	import type {
		DashboardTab,
		DashboardControl,
		DeviceCommandKey,
		ShellyDevice
	} from '$lib/config/schema';
	import {
		getDeviceConfigurationIssues,
		isDeviceCommandConfigured,
		isValidStatusDeviceId
	} from '$lib/config/device-validation';
	import { triggerAction, triggerDeviceCommand } from '$lib/api';
	import type { PageData } from './$types';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import TouchpadOff from 'lucide-svelte/icons/touchpad-off';
	import WifiOff from 'lucide-svelte/icons/wifi-off';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';

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

	type BellHeaderEvent = { at: string; profile: string; time: string; count?: number };
	type BellHeaderStatus = {
		paused?: boolean;
		preview?: boolean;
		next_event?: BellHeaderEvent | null;
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

	export let data: PageData;
	let hydrated = false;

	const wattageDisabled = readBooleanFlag(publicEnv.PUBLIC_DISABLE_WATTAGE);
	const displayDimTimeoutMs = readPositiveNumber(
		publicEnv.PUBLIC_DISPLAY_DIM_TIMEOUT_MS,
		10 * 60 * 1000
	);
	const advancedPromptIdleMs = readPositiveNumber(
		publicEnv.PUBLIC_ADVANCED_PROMPT_IDLE_MS,
		30 * 1000
	);
	const tabIdleMs = 2 * 60 * 1000;
	const draftIdleMs = 10 * 60 * 1000;

	const acceptedAdvancedPatterns = readAdvancedPatterns(
		publicEnv.PUBLIC_ADVANCED_PATTERN,
		publicEnv.PUBLIC_ADVANCED_PIN,
		data?.mode === 'mock' ? '1234' : undefined
	);
	const advancedPatternConfigured = acceptedAdvancedPatterns.length > 0;
	const pinNodes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
	const wattageDebug = readBooleanFlag(publicEnv.PUBLIC_DEBUG_WATTAGE);

	let loadingCommandKeys = new Set<string>();
	let errorMsg = '';
	let deviceActionErrors = new Map<string, string>();
	let deviceActionErrorTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	let advancedErrorMsg = '';
	let advancedStatusMsg = '';
	let deviceStates = new Map<string, DeviceCommandKey>(
		Object.entries(data?.deviceStates ?? {}) as [string, DeviceCommandKey][]
	);
	let statusDeviceStates = new Map<string, DeviceCommandKey>();
	let bellHeaderStatus: BellHeaderStatus | null = null;
	let offlineStatusDeviceIds = new Set<string>();
	let statusFailureCounts = new Map<string, number>();
	let offlineStatusByDeviceId = new Map<string, boolean>();

	const baseControls: DashboardControl[] = [
		...home,
		...devices,
		...configuredAdvancedControls,
		...triggers
	];
	let sceneControls: DashboardControl[] = data?.controls ?? baseControls;
	let dashboardTabs: DashboardTab[] = data?.tabs ?? [
		{ id: 'home', label: 'Home', order: 0 },
		{ id: 'devices', label: 'Apparaten', order: 1 }
	];
	let selectedTab = 'home';
	let devicesPage = 0;
	let controlGrid: HTMLDivElement;
	let showAdvancedInformation = false;
	let advancedRoom: 'modes' | 'domotica' | null = null;
	let domoticaRoomOpen = false;
	$: navigationTabs = [
		...dashboardTabs.filter((tab) => !['devices', 'shelly', 'advanced'].includes(tab.id)),
		{ id: 'schoolbel', label: 'Schoolbel', order: 90 },
		{ id: 'advanced', label: 'Geavanceerd', order: 91 }
	];
	$: if (!navigationTabs.some((tab) => tab.id === selectedTab))
		selectedTab = dashboardTabs[0]?.id ?? 'home';
	let mainControls: DashboardControl[] = [];
	let advancedControls: DashboardControl[] = [];
	let energyDevicesTrigger = defaultEnergyDevicesTrigger;
	let primaryDevices: Extract<DashboardControl, { controlType: 'device' }>[] = [];
	let allDevices: Extract<DashboardControl, { controlType: 'device' }>[] = [];
	let primaryDeviceCount = 0;
	let deviceById = new Map<string, Extract<DashboardControl, { controlType: 'device' }>>();
	let statusDeviceIds: string[] = [];
	let configurationDiagnostics: DiagnosticEntry[] = [];
	let triggerConfigurationDiagnostics: DiagnosticEntry[] = [];
	let advancedControlCount = 0;
	let vacationControl: Extract<DashboardControl, { controlType: 'device' }> | undefined;
	let vacationBeginDisabled = true;
	let vacationEndDisabled = true;

	$: mainControls = [...sceneControls]
		.filter(
			(control) =>
				control.placement === 'main' &&
				(control.tabId ?? 'home') === (selectedTab === 'advanced' ? 'devices' : selectedTab)
		)
		.sort((left, right) => {
			const leftPosition = left.pushNumber;
			const rightPosition = right.pushNumber;
			return (leftPosition ?? Number.MAX_SAFE_INTEGER) - (rightPosition ?? Number.MAX_SAFE_INTEGER);
		});
	$: layoutPages = controlPages(mainControls, selectedTab === 'advanced' ? 'devices' : selectedTab);
	$: devicesPageCount = layoutPages.length;
	$: if (selectedTab !== 'devices' && selectedTab !== 'advanced') devicesPage = 0;
	$: if (devicesPage >= devicesPageCount) devicesPage = devicesPageCount - 1;
	$: visibleGroups =
		layoutPages[selectedTab === 'devices' || selectedTab === 'advanced' ? devicesPage : 0] ?? [];

	function changeDevicesPage(direction: number) {
		devicesPage = Math.max(0, Math.min(devicesPageCount - 1, devicesPage + direction));
		controlGrid?.scrollTo({ top: 0 });
	}
	$: advancedControls = sceneControls
		.filter((control) => control.placement === 'advanced')
		.sort((a, b) => (a.pushNumber ?? 99) - (b.pushNumber ?? 99));
	$: energyDevicesTrigger =
		sceneControls.find(
			(control): control is Extract<DashboardControl, { controlType: 'trigger' }> =>
				control.controlType === 'trigger' && control.placement === 'energy'
		) ?? defaultEnergyDevicesTrigger;
	$: primaryDevices = mainControls.filter(
		(control): control is Extract<DashboardControl, { controlType: 'device' }> =>
			control.controlType === 'device'
	);
	$: allDevices = [...sceneControls].filter(
		(control): control is Extract<DashboardControl, { controlType: 'device' }> =>
			control.controlType === 'device'
	);
	$: offlineStatusByDeviceId = new Map(
		allDevices.map((device) => [
			device.id,
			offlineStatusDeviceIds.has(device.statusdeviceid?.trim() ?? '')
		])
	);
	$: primaryDeviceCount = mainControls.length;
	$: deviceById = new Map(allDevices.map((device) => [device.id, device]));
	$: statusDeviceIds = Array.from(
		new Set(
			allDevices
				.map((device) => device.statusdeviceid?.trim())
				.filter((deviceId): deviceId is string => isValidStatusDeviceId(deviceId))
		)
	);
	$: configurationDiagnostics = allDevices.flatMap((device) => {
		const issues = getDeviceConfigurationIssues(device);
		return issues.length > 0
			? [{ id: device.id, name: device.label, detail: issues.join(' · ') }]
			: [];
	});
	$: triggerConfigurationDiagnostics = [...sceneControls]
		.filter((control) => control.controlType !== 'device')
		.filter((trigger) => trigger.type !== 'placeholder' && !trigger.sceneId?.trim())
		.map((trigger) => ({
			id: trigger.id,
			name: trigger.label,
			detail: 'Scène-ID ontbreekt'
		}));
	$: advancedControlCount = advancedControls.length;
	$: vacationControl = advancedControls.find(
		(control): control is Extract<DashboardControl, { controlType: 'device' }> =>
			control.controlType === 'device' && control.id === 'advanced-vacantie-begin'
	);
	$: vacationBeginDisabled =
		!vacationControl ||
		vacationControl.enabled === false ||
		!isDeviceCommandConfigured(vacationControl, 'on');
	$: vacationEndDisabled =
		!vacationControl ||
		vacationControl.enabled === false ||
		!isDeviceCommandConfigured(vacationControl, 'off');

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
	let showSceneIdEditor = false;
	let advancedUnlocked = false;
	let advancedAccessError = '';
	let advancedPin = '';
	let advancedIdleTimeout: ReturnType<typeof setTimeout> | null = null;
	let pendingProtectedTab = 'advanced';
	let bellVisited = false;
	let editorVisited = false;
	let bellEditorOpen = false;
	let homeIdleTimeout: ReturnType<typeof setTimeout> | null = null;
	let draftIdleTimeout: ReturnType<typeof setTimeout> | null = null;
	let displayDimTimeout: ReturnType<typeof setTimeout> | null = null;
	let displayDimmed = false;
	let stateStream: EventSource | null = null;
	let stateStreamReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	let loadingTriggerIds = new Set<string>();
	let triggerActiveUntilById = new Map<string, number>();
	const triggerActiveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	let energyTriggerError = '';
	let showEnergyTriggerConfirmation = false;
	let browserOnline = true;
	let cloudReachable = true;
	let connectivityChecked = false;
	let connectivityChecking = false;
	let connectivityFailureCount = 0;
	let touchscreenConnected: boolean | null = null;
	let hardwareChecking = false;
	let transientActiveUntilByDevice = new Map<string, number>();
	const transientActiveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

	const commandOrder: DeviceCommandKey[] = ['on', 'off'];

	const commandKey = (deviceId: string, command: DeviceCommandKey) => `${deviceId}:${command}`;
	const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
	const normalWattageRefreshMs = 5 * 60 * 1000;
	const fastWattageRefreshMs = 2 * 60 * 1000;
	const fastWattageWindowMs = 10 * 60 * 1000;
	const liveStatusRefreshMs = 3_000;
	const statusFailureThreshold = 2;
	const statusFollowupDelaysMs = [1200, 2500, 5000, 10000, 20000, 45000, 90000];
	const connectivityRefreshMs = 15000;
	const connectivityFailureThreshold = 2;
	const hardwareRefreshMs = 15000;
	const updatePollIntervalMs = 4000;
	const updatePollMaxMs = 35 * 60 * 1000;

	$: connectionOffline =
		connectivityChecked &&
		(!browserOnline || connectivityFailureCount >= connectivityFailureThreshold);
	$: connectionWarningTitle = browserOnline
		? 'Geen verbinding met Shelly Cloud'
		: 'Geen internetverbinding';
	$: connectionWarningDetail = browserOnline
		? 'Shelly-bediening is tijdelijk niet beschikbaar.'
		: 'Controleer de internetverbinding van de kiosk.';

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

	function isProtectedTab(tab = selectedTab) {
		return tab === 'advanced' || tab === 'schoolbel';
	}

	function scheduleNavigationIdle() {
		if (homeIdleTimeout) clearTimeout(homeIdleTimeout);
		if (draftIdleTimeout) clearTimeout(draftIdleTimeout);
		homeIdleTimeout = null;
		draftIdleTimeout = null;
		if (bellEditorOpen || updateRunning) return;
		homeIdleTimeout = setTimeout(() => {
			selectTab('home');
			cancelEnergyTriggerConfirmation();
		}, tabIdleMs);
		if (!isProtectedTab()) {
			draftIdleTimeout = setTimeout(() => {
				bellVisited = false;
				editorVisited = false;
			}, draftIdleMs);
		}
	}

	function markAdvancedActivity() {
		markDisplayActivity();
		clearAdvancedIdleTimer();
		if (showAdvancedPrompt) {
			advancedIdleTimeout = setTimeout(closeAdvancedPrompt, advancedPromptIdleMs);
		}
	}

	function resumeAdvancedIdleTimerAfterUpdate() {
		scheduleNavigationIdle();
		scheduleDisplayDim();
	}

	function setBellEditorOpen(open: boolean) {
		bellEditorOpen = open;
		scheduleNavigationIdle();
		scheduleDisplayDim();
	}

	function revokeProtectedAccess() {
		advancedRoom = null;
		domoticaRoomOpen = false;
		advancedUnlocked = false;
		showAdvancedPanel = false;
		showSceneIdEditor = false;
		showAdvancedInformation = false;
		bellEditorOpen = false;
		cacheMessage = '';
		if (isProtectedTab(selectedTab)) selectedTab = 'home';
	}

	function selectTab(tab: string) {
		if (tab === selectedTab && !showAdvancedPrompt) return;
		closeAdvancedPrompt();
		revokeProtectedAccess();
		if (isProtectedTab(tab)) {
			pendingProtectedTab = tab;
			showAdvancedPrompt = true;
			markAdvancedActivity();
		} else {
			selectedTab = tab;
		}
		scheduleNavigationIdle();
	}

	function clearDisplayDimTimer() {
		if (displayDimTimeout) {
			clearTimeout(displayDimTimeout);
			displayDimTimeout = null;
		}
	}

	function scheduleDisplayDim() {
		clearDisplayDimTimer();
		if (displayDimTimeoutMs <= 0 || bellEditorOpen || updateRunning) return;
		displayDimTimeout = setTimeout(() => {
			selectTab('home');
			cancelEnergyTriggerConfirmation();
			displayDimmed = true;
			displayDimTimeout = null;
			pauseIdleSensitivePolling();
		}, displayDimTimeoutMs);
	}

	function markDisplayActivity() {
		if (displayDimmed) return;
		displayDimmed = false;
		scheduleDisplayDim();
		scheduleNavigationIdle();
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.pointerType === 'touch') {
			document.documentElement.classList.add('touch-cursor-hidden');
		}
		markDisplayActivity();
	}

	function handlePointerMove(event: PointerEvent) {
		markDisplayActivity();
		if (event.pointerType === 'mouse') {
			document.documentElement.classList.remove('touch-cursor-hidden');
		} else if (event.pointerType === 'touch') {
			document.documentElement.classList.add('touch-cursor-hidden');
		}
	}

	function wakeDisplay(event?: Event) {
		event?.preventDefault();
		event?.stopPropagation();
		displayDimmed = false;
		scheduleDisplayDim();
		scheduleNavigationIdle();
		startIdleSensitivePolling(true);
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
		if (displayDimmed || wattageLoading) return;
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
				throw new Error('Onverwacht antwoord voor het vermogen.');
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
	let queuedStatusRefreshIds = new Set<string>();
	let statusFollowupTimeouts: ReturnType<typeof setTimeout>[] = [];
	let fastWattageRefreshUntil = 0;

	function scheduleAutomaticWattageRefresh() {
		if (wattageAutomaticRefreshTimeout) {
			clearTimeout(wattageAutomaticRefreshTimeout);
			wattageAutomaticRefreshTimeout = null;
		}
		if (wattageDisabled || displayDimmed || typeof window === 'undefined') return;

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
		if (wattageDisabled || displayDimmed) return;
		startFastWattageRefreshWindow();
		if (wattageRefreshTimeout) clearTimeout(wattageRefreshTimeout);
		wattageRefreshTimeout = setTimeout(() => {
			wattageRefreshTimeout = null;
			void refreshWattage(true);
		}, 150);
	}

	function scheduleAutomaticStatusRefresh() {
		if (statusAutomaticRefreshTimeout) {
			clearTimeout(statusAutomaticRefreshTimeout);
			statusAutomaticRefreshTimeout = null;
		}
		if (displayDimmed || typeof window === 'undefined' || statusDeviceIds.length === 0) return;

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
		const nextFailureCounts = new Map(statusFailureCounts);
		const nextOfflineIds = new Set(offlineStatusDeviceIds);

		Object.entries(states).forEach(([id, entry]) => {
			if (entry?.lastCommand === 'on' || entry?.lastCommand === 'off') {
				nextStatusStates.set(id, entry.lastCommand);
				nextDeviceStates.set(id, entry.lastCommand);
				nextFailureCounts.delete(id);
				nextOfflineIds.delete(id);
			}
		});

		for (const id of unavailableIds) {
			if (states[id]?.lastCommand === 'on' || states[id]?.lastCommand === 'off') continue;
			const failures = (nextFailureCounts.get(id) ?? 0) + 1;
			nextFailureCounts.set(id, failures);
			if (failures >= statusFailureThreshold) nextOfflineIds.add(id);
		}

		statusDeviceStates = nextStatusStates;
		deviceStates = nextDeviceStates;
		statusFailureCounts = nextFailureCounts;
		offlineStatusDeviceIds = nextOfflineIds;
		const confirmedIds = new Set(Object.keys(states));
		if (confirmedIds.size) {
			const nextActionErrors = new Map(deviceActionErrors);
			for (const device of allDevices) {
				if (!confirmedIds.has(device.statusdeviceid?.trim() ?? '')) continue;
				nextActionErrors.delete(device.id);
				const timeout = deviceActionErrorTimeouts.get(device.id);
				if (timeout) clearTimeout(timeout);
				deviceActionErrorTimeouts.delete(device.id);
			}
			deviceActionErrors = nextActionErrors;
		}
	}

	function clearDeviceActionError(deviceId: string) {
		const timeout = deviceActionErrorTimeouts.get(deviceId);
		if (timeout) clearTimeout(timeout);
		deviceActionErrorTimeouts.delete(deviceId);
		if (!deviceActionErrors.has(deviceId)) return;
		const next = new Map(deviceActionErrors);
		next.delete(deviceId);
		deviceActionErrors = next;
	}

	async function refreshStatusDevices(ids = statusDeviceIds) {
		const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
		if (displayDimmed || uniqueIds.length === 0) return;
		if (statusRefreshLoading) {
			queuedStatusRefreshIds = new Set([...queuedStatusRefreshIds, ...uniqueIds]);
			return;
		}

		statusRefreshLoading = true;
		try {
			const params = new URLSearchParams({ ids: uniqueIds.join(',') });
			const res = await fetch(`/api/device-output?${params.toString()}`, { cache: 'no-store' });
			if (displayDimmed) return;
			if (!res.ok) return;

			const payload = (await res.json()) as {
				ok: boolean;
				states: Record<string, { lastCommand: DeviceCommandKey }>;
				errors?: Record<string, string>;
			};
			if (!payload?.ok || !payload.states) return;
			const unavailableIds = Array.from(
				new Set([
					...Object.keys(payload.errors ?? {}),
					...uniqueIds.filter(
						(id) =>
							payload.states[id]?.lastCommand !== 'on' && payload.states[id]?.lastCommand !== 'off'
					)
				])
			);
			applyStatusDeviceStates(payload.states, unavailableIds);
		} catch {
			// A failed dashboard request is not evidence that each individual Shelly is offline.
		} finally {
			statusRefreshLoading = false;
			if (queuedStatusRefreshIds.size) {
				const queuedIds = Array.from(queuedStatusRefreshIds);
				queuedStatusRefreshIds = new Set();
				void refreshStatusDevices(queuedIds);
			} else {
				scheduleAutomaticStatusRefresh();
			}
		}
	}

	function clearStatusFollowups() {
		statusFollowupTimeouts.forEach((timeout) => clearTimeout(timeout));
		statusFollowupTimeouts = [];
	}

	function statusDeviceBaseId(deviceId: string) {
		return deviceId.trim().replace(/_\d+$/, '').toLowerCase();
	}

	function startStatusFollowup(statusDeviceId: string) {
		const cleanDeviceId = statusDeviceId.trim();
		if (!cleanDeviceId || displayDimmed) return;
		clearStatusFollowups();
		const relatedStatusDeviceIds = statusDeviceIds.filter(
			(deviceId) => statusDeviceBaseId(deviceId) === statusDeviceBaseId(cleanDeviceId)
		);

		statusFollowupTimeouts = statusFollowupDelaysMs.map((delay) =>
			setTimeout(() => {
				void refreshStatusDevices(relatedStatusDeviceIds);
			}, delay)
		);
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
		loadingCommandKeys = new Set([...loadingCommandKeys, key]);
		clearDeviceActionError(deviceId);
		errorMsg = '';
		advancedErrorMsg = '';
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
			if (selectedTab === 'advanced' && advancedUnlocked && showAdvancedPanel) {
				markAdvancedActivity();
			}
		} catch (err) {
			const error = err as Error & { code?: string };
			const detail =
				error?.code === 'TIMEOUT'
					? 'Apparaat reageert niet.'
					: error instanceof Error
						? error.message
						: 'Onbekende fout';
			const nextErrors = new Map(deviceActionErrors);
			nextErrors.set(
				deviceId,
				/niet bereikbaar|reageert niet|fetch failed|timed out|timeout/i.test(detail)
					? 'Apparaat niet bereikbaar'
					: detail
			);
			deviceActionErrors = nextErrors;
			const existingTimeout = deviceActionErrorTimeouts.get(deviceId);
			if (existingTimeout) clearTimeout(existingTimeout);
			deviceActionErrorTimeouts.set(
				deviceId,
				setTimeout(() => clearDeviceActionError(deviceId), 8000)
			);
			if (device.statusdeviceid) startStatusFollowup(device.statusdeviceid);
		} finally {
			const nextLoadingCommandKeys = new Set(loadingCommandKeys);
			nextLoadingCommandKeys.delete(key);
			loadingCommandKeys = nextLoadingCommandKeys;
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

	function applyDeviceStates(
		states: Record<string, { lastCommand: DeviceCommandKey; source?: string }>
	) {
		const next = new Map<string, DeviceCommandKey>();
		const nextStatusStates = new Map(statusDeviceStates);
		Object.entries(states).forEach(([id, entry]) => {
			if (entry?.lastCommand) {
				next.set(id, entry.lastCommand);
				const statusDeviceId = statusDeviceIds.includes(id)
					? id
					: deviceById.get(id)?.statusdeviceid;
				if (
					statusDeviceId &&
					(entry.source === 'status-lan' ||
						entry.source === 'status-poll' ||
						entry.source === 'status-demo')
				) {
					nextStatusStates.set(statusDeviceId, entry.lastCommand);
				} else if (statusDeviceId && entry.source === 'action') {
					nextStatusStates.delete(statusDeviceId);
				}
			}
		});
		deviceStates = next;
		statusDeviceStates = nextStatusStates;
	}

	function applyDeviceStateUpdate(deviceId: string, command: DeviceCommandKey, source?: string) {
		const next = new Map(deviceStates);
		next.set(deviceId, command);
		deviceStates = next;

		if (source === 'action') {
			const statusDeviceId = deviceById.get(deviceId)?.statusdeviceid;
			if (statusDeviceId) {
				const nextStatusStates = new Map(statusDeviceStates);
				nextStatusStates.delete(statusDeviceId);
				statusDeviceStates = nextStatusStates;
			}
			return;
		}

		if (source === 'status-lan' || source === 'status-poll' || source === 'status-demo') {
			const statusDeviceId = statusDeviceIds.includes(deviceId)
				? deviceId
				: deviceById.get(deviceId)?.statusdeviceid;
			if (!statusDeviceId) return;
			const nextStatusStates = new Map(statusDeviceStates);
			nextStatusStates.set(statusDeviceId, command);
			statusDeviceStates = nextStatusStates;
		}
	}

	async function loadDeviceStates() {
		try {
			const res = await fetch('/api/device-state', { cache: 'no-store' });
			if (!res.ok) return;
			const payload = (await res.json()) as {
				ok: boolean;
				states: Record<string, { lastCommand: DeviceCommandKey; source?: string }>;
			};
			if (!payload?.ok || !payload.states) return;
			applyDeviceStates(payload.states);
		} catch {}
	}

	function startStateStream() {
		if (displayDimmed || typeof window === 'undefined' || stateStream) return;
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

		stream.addEventListener('configuration', () => {
			void refreshDashboardConfiguration(true);
		});

		stream.addEventListener('state', (event) => {
			const data = (event as MessageEvent<string>).data;
			if (!data) return;
			try {
				const payload = JSON.parse(data) as {
					deviceId: string;
					state: { lastCommand: DeviceCommandKey; source?: string };
				};
				if (payload?.deviceId && payload.state?.lastCommand) {
					applyDeviceStateUpdate(payload.deviceId, payload.state.lastCommand, payload.state.source);
				}
			} catch {}
		});

		stream.addEventListener('error', () => {
			stream.close();
			stateStream = null;
			if (stateStreamReconnectTimeout) clearTimeout(stateStreamReconnectTimeout);
			if (displayDimmed) return;
			stateStreamReconnectTimeout = setTimeout(() => {
				stateStreamReconnectTimeout = null;
				if (!displayDimmed) {
					startStateStream();
				}
			}, 3000);
		});

		stateStream = stream;
	}

	function closeAdvancedPrompt() {
		showAdvancedPrompt = false;
		clearAdvancedPin();
		advancedAccessError = '';
		clearAdvancedIdleTimer();
	}

	function submitAdvancedPin(event?: Event) {
		event?.preventDefault();
		if (!advancedPin.trim()) return;

		const accepted =
			advancedPatternConfigured && acceptedAdvancedPatterns.includes(advancedPin.trim());
		logAdvancedPinAttempt(accepted);
		if (accepted) {
			advancedUnlocked = true;
			showAdvancedPrompt = false;
			advancedAccessError = '';
			advancedPin = '';
			selectedTab = pendingProtectedTab;
			showAdvancedPanel = selectedTab === 'advanced';
			if (selectedTab === 'schoolbel') bellVisited = true;
			markAdvancedActivity();
		} else {
			advancedErrorMsg = '';
			advancedAccessError = 'Onjuiste PIN. Probeer het opnieuw.';
			advancedPin = '';
		}
	}

	function logAdvancedPinAttempt(accepted: boolean) {
		void fetch('/api/audit/pin', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ source: 'advanced-access', accepted })
		})
			.then((response) => {
				if (!response.ok) console.error('[audit] PIN event was not accepted by the server.');
			})
			.catch((error: unknown) => console.error('[audit] Could not submit PIN event:', error));
	}

	function appendAdvancedPinDigit(digit: number) {
		const value = String(digit);
		if (advancedPin.length >= 32 || advancedPin.includes(value)) return;
		advancedPin += value;
		advancedAccessError = '';
		markAdvancedActivity();
	}

	function clearAdvancedPin(event?: Event) {
		event?.preventDefault();
		advancedPin = '';
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
				updateMessage = payload.message ?? 'Kon de updatestatus niet ophalen';
				updatePhase = 'error';
			} else if (payload.updating) {
				updateRunning = true;
				clearDisplayDimTimer();
				scheduleNavigationIdle();
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
		clearDisplayDimTimer();
		scheduleNavigationIdle();
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
		if (displayDimmed || connectivityChecking || typeof navigator === 'undefined') return;

		browserOnline = navigator.onLine;
		if (!browserOnline) {
			cloudReachable = false;
			connectivityFailureCount = connectivityFailureThreshold;
			connectivityChecked = true;
			return;
		}

		connectivityChecking = true;
		try {
			const res = await fetch('/api/connectivity', { cache: 'no-store' });
			const payload = (await res.json().catch(() => null)) as { online?: boolean } | null;
			cloudReachable = res.ok && payload?.online === true;
			connectivityFailureCount = cloudReachable ? 0 : connectivityFailureCount + 1;
		} catch {
			cloudReachable = false;
			connectivityFailureCount += 1;
		} finally {
			connectivityChecked = true;
			connectivityChecking = false;
		}
	}

	function handleBrowserOnline() {
		browserOnline = true;
		connectivityFailureCount = 0;
		if (!displayDimmed) {
			void checkConnectivity();
		}
	}

	function handleBrowserOffline() {
		browserOnline = false;
		cloudReachable = false;
		connectivityFailureCount = connectivityFailureThreshold;
		connectivityChecked = true;
	}

	async function checkHardware() {
		if (displayDimmed || hardwareChecking) return;
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
		loadingTriggerIds = new Set([...loadingTriggerIds, triggerId]);
		advancedErrorMsg = '';
		advancedStatusMsg = '';
		let succeeded = false;
		try {
			const response = await triggerAction(triggerId);
			const trigger = sceneControls.find((control) => control.id === triggerId);
			if (
				trigger?.controlType === 'timed-trigger' &&
				Number.isFinite(response.activeUntil) &&
				Number(response.activeUntil) > Date.now()
			) {
				startTriggerTimer(triggerId, Number(response.activeUntil));
				advancedStatusMsg = `${trigger.label}: timer gestart.`;
				if (response.timerStatePersisted === false) {
					advancedErrorMsg =
						'De timer is gestart, maar de status kon niet worden opgeslagen voor later.';
				}
			} else if (trigger) {
				advancedStatusMsg = `${trigger.label}: actie uitgevoerd.`;
			}
			succeeded = true;
			if (selectedTab === 'advanced' && advancedUnlocked && showAdvancedPanel) {
				markAdvancedActivity();
			}
		} catch (err) {
			const error = err as Error & { code?: string };
			advancedErrorMsg =
				error?.code === 'TIMEOUT'
					? 'Shelly antwoordde niet. Controleer de lampstatus voordat u opnieuw drukt.'
					: error instanceof Error
						? error.message
						: 'Onbekende fout';
		} finally {
			const nextLoadingTriggerIds = new Set(loadingTriggerIds);
			nextLoadingTriggerIds.delete(triggerId);
			loadingTriggerIds = nextLoadingTriggerIds;
			if (succeeded) {
				requestWattageRefresh();
			}
		}
	}

	async function refreshDashboardConfiguration(refreshControls = false) {
		try {
			const response = await fetch('/api/config/scenes', { cache: 'no-store' });
			if (!response.ok) return;
			const payload = await response.json();
			if (payload.tabs) dashboardTabs = payload.tabs;
			if (refreshControls && payload.controls) sceneControls = payload.controls;
		} catch {
			/* Keep the current navigation when offline. */
		}
	}

	function handleSceneControlsUpdate(nextControls: DashboardControl[]) {
		sceneControls = nextControls;
		void refreshDashboardConfiguration();
	}

	function startTriggerTimer(triggerId: string, activeUntil: number) {
		if (activeUntil <= Date.now()) return;
		const trigger = sceneControls.find(
			(control): control is Extract<DashboardControl, { controlType: 'timed-trigger' }> =>
				control.controlType === 'timed-trigger' && control.id === triggerId
		);
		if (!trigger) return;

		const durationMs = activeUntil - Date.now();
		const nextActiveUntilById = new Map(triggerActiveUntilById);
		nextActiveUntilById.set(triggerId, activeUntil);
		triggerActiveUntilById = nextActiveUntilById;

		const existingTimeout = triggerActiveTimeouts.get(triggerId);
		if (existingTimeout) clearTimeout(existingTimeout);
		triggerActiveTimeouts.set(
			triggerId,
			setTimeout(() => {
				const next = new Map(triggerActiveUntilById);
				next.delete(triggerId);
				triggerActiveUntilById = next;
				triggerActiveTimeouts.delete(triggerId);
			}, durationMs)
		);
	}

	async function restoreActiveTriggerTimers() {
		try {
			const response = await fetch('/api/timed-triggers', { cache: 'no-store' });
			if (!response.ok) throw new Error('Actieve timers konden niet worden geladen.');
			const payload = (await response.json()) as {
				ok?: boolean;
				activeUntilById?: Record<string, number>;
			};
			if (!payload.ok || !payload.activeUntilById) {
				throw new Error('Ongeldig antwoord voor actieve timers.');
			}
			for (const [triggerId, activeUntil] of Object.entries(payload.activeUntilById)) {
				if (Number.isFinite(activeUntil)) startTriggerTimer(triggerId, activeUntil);
			}
		} catch (error) {
			console.error('[timer] Could not restore active timers:', error);
			advancedErrorMsg = 'De actieve timers konden niet worden opgehaald.';
		}
	}

	async function handleEnergyTriggerPress() {
		const energyTriggerId = energyDevicesTrigger.id;
		loadingTriggerIds = new Set([...loadingTriggerIds, energyTriggerId]);
		energyTriggerError = '';
		try {
			await triggerAction(energyDevicesTrigger.id);
			requestWattageRefresh();
		} catch (err) {
			const error = err as Error & { code?: string };
			energyTriggerError =
				error?.code === 'TIMEOUT'
					? 'Shelly antwoordde niet. Controleer de status voordat u opnieuw drukt.'
					: error instanceof Error
						? error.message
						: 'Scène kon niet worden uitgevoerd';
		} finally {
			const nextLoadingTriggerIds = new Set(loadingTriggerIds);
			nextLoadingTriggerIds.delete(energyTriggerId);
			loadingTriggerIds = nextLoadingTriggerIds;
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

	async function refreshBellHeader() {
		if (data?.mode === 'mock') return;
		try {
			const response = await fetch('/api/bells/status', { cache: 'no-store' });
			if (!response.ok) throw new Error('Bell status unavailable');
			bellHeaderStatus = (await response.json()) as BellHeaderStatus;
		} catch {
			bellHeaderStatus = null;
		}
	}

	function formatHeaderBellTime(event: BellHeaderEvent) {
		return (
			new Intl.DateTimeFormat('nl-NL', {
				weekday: 'short',
				hour: '2-digit',
				minute: '2-digit',
				timeZone: 'Europe/Amsterdam',
				hourCycle: 'h23'
			}).format(new Date(event.at)) + (event.count === 2 ? ' · 2×' : '')
		);
	}

	const polling = createPollingGroup([
		{ intervalMs: connectivityRefreshMs, run: checkConnectivity },
		{ intervalMs: hardwareRefreshMs, run: checkHardware },
		{ intervalMs: 5_000, run: loadDeviceStates },
		{ intervalMs: 30_000, run: refreshBellHeader }
	]);

	function pauseIdleSensitivePolling() {
		polling.pause();
		if (wattageRefreshTimeout) {
			clearTimeout(wattageRefreshTimeout);
			wattageRefreshTimeout = null;
		}
		if (wattageAutomaticRefreshTimeout) {
			clearTimeout(wattageAutomaticRefreshTimeout);
			wattageAutomaticRefreshTimeout = null;
		}
		if (statusAutomaticRefreshTimeout) {
			clearTimeout(statusAutomaticRefreshTimeout);
			statusAutomaticRefreshTimeout = null;
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
	}

	function startIdleSensitivePolling(refreshImmediately = false) {
		if (displayDimmed || typeof window === 'undefined') return;

		polling.start();
		startStateStream();

		if (refreshImmediately) {
			void loadDeviceStates();
			void checkConnectivity();
			void checkHardware();
			void refreshBellHeader();
			void refreshStatusDevices();
			if (!wattageDisabled) {
				void refreshWattage(true);
			}
		} else {
			scheduleAutomaticStatusRefresh();
			scheduleAutomaticWattageRefresh();
		}
	}

	onMount(() => {
		hydrated = true;
		if (typeof window !== 'undefined') {
			window.addEventListener('contextmenu', preventContextMenu);
			window.addEventListener('pointerdown', handlePointerDown, { passive: true, capture: true });
			window.addEventListener('pointermove', handlePointerMove, { passive: true });
			window.addEventListener('keydown', markDisplayActivity, true);
			window.addEventListener('input', markDisplayActivity, true);
			window.addEventListener('wheel', markDisplayActivity, { passive: true, capture: true });
			window.addEventListener('touchmove', markDisplayActivity, { passive: true, capture: true });
			window.addEventListener('online', handleBrowserOnline);
			window.addEventListener('offline', handleBrowserOffline);
			browserOnline = navigator.onLine;
			if (!browserOnline) {
				handleBrowserOffline();
			}
			scheduleDisplayDim();
			scheduleNavigationIdle();
			startIdleSensitivePolling(true);
			void loadDeviceStates();
			void restoreActiveTriggerTimers();
		}
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('contextmenu', preventContextMenu);
			window.removeEventListener('pointerdown', handlePointerDown, true);
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('keydown', markDisplayActivity, true);
			window.removeEventListener('input', markDisplayActivity, true);
			window.removeEventListener('wheel', markDisplayActivity, true);
			window.removeEventListener('touchmove', markDisplayActivity, true);
			window.removeEventListener('online', handleBrowserOnline);
			window.removeEventListener('offline', handleBrowserOffline);
		}
		pauseIdleSensitivePolling();
		transientActiveTimeouts.forEach((timeout) => clearTimeout(timeout));
		transientActiveTimeouts.clear();
		deviceActionErrorTimeouts.forEach((timeout) => clearTimeout(timeout));
		deviceActionErrorTimeouts.clear();
		triggerActiveTimeouts.forEach((timeout) => clearTimeout(timeout));
		triggerActiveTimeouts.clear();
		clearUpdatePoll();
		clearAdvancedIdleTimer();
		clearDisplayDimTimer();
		if (homeIdleTimeout) clearTimeout(homeIdleTimeout);
		if (draftIdleTimeout) clearTimeout(draftIdleTimeout);
	});
</script>

<UpdateProgress phase={updatePhase} />

<main
	data-hydrated={hydrated}
	class="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-900"
>
	{#if data.mode === 'mock'}<p class="absolute top-1 left-4 z-10 text-xs text-slate-500">
			Demo · geen apparatuur verbonden
		</p>{/if}
	<header class="border-b border-slate-300 bg-white px-6 py-4">
		<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
			<div>
				<h1 class="text-2xl font-semibold text-slate-900">Shelly-bediening</h1>
			</div>
			<div class="flex flex-wrap items-center justify-end gap-3">
				{#if selectedTab === 'home' && (data.mode === 'mock' || bellHeaderStatus)}
					<div class="text-right" aria-label="Schoolbel">
						<p class="text-xs font-medium text-slate-500">Volgende bel</p>
						<p class="text-sm font-semibold text-slate-800">
							{#if data.mode === 'mock'}
								<span class="text-slate-500">Lokaal voorbeeld</span>
							{:else if bellHeaderStatus?.paused}
								Uit
							{:else if bellHeaderStatus?.next_event}
								{formatHeaderBellTime(bellHeaderStatus.next_event)}
							{:else}
								onbekend
							{/if}
						</p>
					</div>
				{/if}
			</div>
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
				<p class="text-base font-bold">{connectionWarningTitle}</p>
				<p class="text-sm text-red-100">{connectionWarningDetail}</p>
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

	<div class="dashboard-content flex min-h-0 flex-1 gap-4 overflow-hidden px-4 pt-4 pb-4">
		<EnergyPanel
			{wattageLabel}
			{wattageStale}
			{wattageDisabled}
			{wattageUpdatedAt}
			{wattageLoading}
			{handleManualWattageRefresh}
			{wattageTotal}
			{formatTotalWatts}
			{loadingTriggerIds}
			{energyDevicesTrigger}
			{openEnergyTriggerConfirmation}
			{energyTriggerError}
			{wattageSummary}
			{availableWattageMeasurements}
			{topWattageDevices}
			{formatWatts}
			{topWattageMax}
			{wattageError}
		>
			<TabSelector
				tabs={navigationTabs}
				selected={selectedTab}
				on:select={({ detail }) => selectTab(detail)}
			/>
		</EnergyPanel>

		<section
			class="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-slate-300 bg-white p-4"
		>
			<header class="mb-4 flex items-center justify-between">
				<div>
					<h2 class="text-2xl font-semibold text-slate-900">
						{navigationTabs.find((tab) => tab.id === selectedTab)?.label ?? 'Bediening'}
					</h2>
				</div>
				{#if selectedTab !== 'schoolbel' && selectedTab !== 'advanced'}<span
						class="text-sm text-slate-500"
						>{selectedTab === 'advanced' ? advancedControlCount : primaryDeviceCount} knoppen</span
					>{/if}
			</header>
			{#if selectedTab === 'advanced' && advancedUnlocked && showAdvancedPanel && (advancedRoom === null || advancedRoom === 'modes')}
				<AdvancedPanel
					informationOpen={showAdvancedInformation}
					activity={markAdvancedActivity}
					toggleInformation={() => (showAdvancedInformation = !showAdvancedInformation)}
					showFooter={advancedRoom === null}
				>
					{#if advancedRoom === null}
						<div
							class="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 lg:grid-cols-2"
							aria-label="Geavanceerde ruimtes"
						>
							<button
								type="button"
								class="flex min-h-44 flex-col items-start justify-center gap-3 rounded-lg border border-slate-300 bg-white p-6 text-left hover:border-sky-500 hover:bg-sky-50"
								on:click={() => (advancedRoom = 'modes')}
							>
								<span class="text-2xl font-semibold text-slate-900">Vakantiemodi</span>
							</button>
							<button
								type="button"
								class="flex min-h-44 flex-col items-start justify-center gap-3 rounded-lg border border-slate-300 bg-white p-6 text-left hover:border-sky-500 hover:bg-sky-50"
								on:click={() => (advancedRoom = 'domotica')}
							>
								<span class="text-2xl font-semibold text-slate-900">Domotica</span>
							</button>
						</div>
					{:else}
						<button
							type="button"
							class="mb-4 inline-flex min-h-12 items-center gap-2 self-start rounded-md border border-slate-300 px-4 py-2 font-semibold"
							on:click={() => (advancedRoom = null)}
							><ArrowLeft size={20} aria-hidden="true" /><span>Terug naar Geavanceerd</span></button
						>
						<h3 class="mb-3 text-xl font-semibold">Vakantiemodi</h3>
						<div class="flex min-h-0 flex-1 flex-col gap-6 px-6 py-6 lg:flex-row">
							<section class="flex min-h-0 flex-1 flex-col">
								{#if vacationControl}
									<VacationStatus
										active={selectedTab === 'advanced' &&
											advancedUnlocked &&
											showAdvancedPanel &&
											advancedRoom === 'modes' &&
											!displayDimmed}
										label={vacationControl.label}
										begin={() => handlePress('advanced-vacantie-begin', 'on')}
										end={() => handlePress('advanced-vacantie-begin', 'off')}
										busy={loadingCommandKeys.has(commandKey('advanced-vacantie-begin', 'on')) ||
											loadingCommandKeys.has(commandKey('advanced-vacantie-begin', 'off'))}
										error={deviceActionErrors.get('advanced-vacantie-begin') ?? null}
										beginDisabled={vacationBeginDisabled}
										endDisabled={vacationEndDisabled}
									/>
								{/if}
								{#if advancedErrorMsg}<p
										class="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
									>
										{advancedErrorMsg}
									</p>{/if}
								{#if advancedStatusMsg}<p
										class="mb-3 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-base font-semibold text-green-900"
										role="status"
										aria-live="polite"
									>
										{advancedStatusMsg}
									</p>{/if}
							</section>
						</div>
					{/if}
					<svelte:fragment slot="actions">
						{#if advancedRoom === null}<button
								type="button"
								class="inline-flex min-h-12 items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100"
								aria-expanded={showSceneIdEditor}
								on:click={() => {
									editorVisited = true;
									showSceneIdEditor = !showSceneIdEditor;
									markAdvancedActivity();
								}}
							>
								<span>Bediening beheren</span>
								<span aria-hidden="true">{showSceneIdEditor ? '−' : '+'}</span>
							</button>{/if}
					</svelte:fragment>
				</AdvancedPanel>
			{/if}
			{#if selectedTab === 'advanced' && advancedUnlocked && advancedRoom === 'domotica'}
				{#if !domoticaRoomOpen}<button
						type="button"
						class="mb-4 inline-flex min-h-12 items-center gap-2 self-start rounded-md border border-slate-300 px-4 py-2 font-semibold"
						on:click={() => (advancedRoom = null)}
						><ArrowLeft size={20} aria-hidden="true" /><span>Terug naar Geavanceerd</span></button
					>
					<h3 class="mb-3 text-xl font-semibold">Domotica</h3>{/if}
				<ShellyBrowser
					active={selectedTab === 'advanced' &&
						advancedUnlocked &&
						advancedRoom === 'domotica' &&
						!displayDimmed}
					on:roomchange={({ detail }) => (domoticaRoomOpen = detail)}
				/>
			{/if}
			{#if bellVisited}
				<div
					hidden={selectedTab !== 'schoolbel' || !advancedUnlocked}
					class="min-h-0 flex-1 overflow-y-auto"
				>
					<BellManager
						active={selectedTab === 'schoolbel' && advancedUnlocked && !displayDimmed}
						on:editing={({ detail }) => setBellEditorOpen(detail)}
					/>
				</div>
			{/if}

			{#if !isProtectedTab(selectedTab) && selectedTab !== 'shelly'}
				{#if errorMsg}
					<p
						class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
					>
						{errorMsg}
					</p>
				{/if}
				<div
					bind:this={controlGrid}
					class={`grid min-h-0 flex-1 gap-6 overflow-y-auto pr-1 pb-2 ${selectedTab === 'home' || selectedTab === 'devices' ? 'grid-cols-3 grid-rows-3' : 'auto-rows-[minmax(160px,1fr)] grid-cols-3'}`}
				>
					{#each visibleGroups as group (group.id)}
						<div
							class={group.wide
								? 'gang-control-group col-span-3 flex min-h-0 flex-col gap-3 rounded-[var(--control-radius)] border border-slate-300 bg-white p-[var(--control-padding)]'
								: 'contents'}
						>
							{#if group.wide}<h3
									class="text-[length:var(--control-label-size)] font-semibold text-slate-800"
								>
									{group.controls[0].label}
								</h3>{/if}
							<div
								class={group.wide ? 'gang-control-options grid min-h-0 flex-1 gap-4' : 'contents'}
							>
								{#each group.controls as control (control.id)}
									<div
										class="relative flex min-h-0 flex-col"
										style={selectedTab === 'home' && control.pushNumber
											? `grid-column: ${homeGridPosition(control.pushNumber).column}; grid-row: ${homeGridPosition(control.pushNumber).row}`
											: ''}
									>
										<ControlCard
											cardNumber={selectedTab === 'home' ? control.pushNumber : undefined}
											embedded={group.wide}
											compactLabel={group.wide
												? control.label.replace(/^Gang Color\s*/, '')
												: undefined}
											{control}
											statusOffline={offlineStatusByDeviceId.get(control.id) ?? false}
											actionError={deviceActionErrors.get(control.id) ?? null}
											{commandOrder}
											{commandKey}
											{commandLabel}
											{resolveToggleCommand}
											{loadingCommandKeys}
											{loadingTriggerIds}
											transientActive={control.controlType === 'device' &&
												isTransientDeviceActive(control.id)}
											initialStatus={control.controlType === 'device'
												? resolveCardStatus(control, deviceStates, statusDeviceStates)
												: null}
											activeUntil={triggerActiveUntilById.get(control.id) ?? null}
											on:command={({ detail }) =>
												handlePress(detail.deviceId, detail.command, {
													stateless: deviceById.get(detail.deviceId)?.stateless
												})}
											on:trigger={({ detail }) => handleTriggerPress(detail.triggerId)}
										/>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
				{#if selectedTab === 'devices' && devicesPageCount > 1}
					<nav
						class="mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 pt-3"
						aria-label="Pagina’s apparaten"
					>
						<button
							type="button"
							class="flex min-h-12 items-center gap-2 rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:opacity-40"
							aria-label="Vorige pagina apparaten"
							disabled={devicesPage === 0}
							on:click={() => changeDevicesPage(-1)}
							><ChevronLeft size={22} /><span class="hidden sm:inline">Vorige</span></button
						>
						<span class="text-sm font-semibold text-slate-700" aria-live="polite"
							>Pagina {devicesPage + 1} van {devicesPageCount}</span
						>
						<button
							type="button"
							class="flex min-h-12 items-center gap-2 rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:opacity-40"
							aria-label="Volgende pagina apparaten"
							disabled={devicesPage === devicesPageCount - 1}
							on:click={() => changeDevicesPage(1)}
							><span class="hidden sm:inline">Volgende</span><ChevronRight size={22} /></button
						>
					</nav>
				{/if}
			{/if}
		</section>
	</div>

	{#if displayDimmed}
		<button
			type="button"
			class="fixed inset-0 z-[70] flex cursor-default items-center justify-center bg-black"
			aria-label="Scherm actief maken"
			on:click={wakeDisplay}
			on:keydown={wakeDisplay}
		>
			<div class="flex flex-col items-center justify-center gap-6">
				<svg
					class="pointer-events-none h-[200px] w-[300px] text-white"
					viewBox="0 0 120 80"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M48 10c-17 5-27 21-23 37 4 17 21 27 38 22 9-3 16-9 20-17-7 3-15 3-22-1-15-8-20-26-13-41z"
						fill="currentColor"
					/>
					<path
						d="M78 18h14L78 33h15M91 43h10L91 56h11"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="4"
					/>
				</svg>

				<span class="text-xl font-medium text-white"> Tik om te wekken </span>
			</div>
		</button>
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
			<p class="mt-3 text-base text-slate-700">LET OP: Dit schakelt alleen de verlichting uit.</p>
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
	<AdvancedAccess
		targetLabel={pendingProtectedTab === 'schoolbel' ? 'Schoolbel' : 'Geavanceerde bediening'}
		{closeAdvancedPrompt}
		{markAdvancedActivity}
		{advancedPatternConfigured}
		{advancedAccessError}
		{pinNodes}
		{advancedPin}
		{appendAdvancedPinDigit}
		{clearAdvancedPin}
		{submitAdvancedPin}
	/>
{/if}

{#if selectedTab === 'advanced' && advancedUnlocked && showAdvancedPanel}
	{#if showAdvancedInformation}
		<DebugInformation
			activity={markAdvancedActivity}
			{browserOnline}
			cloudAvailable={connectivityChecked ? cloudReachable : null}
			{touchscreenConnected}
			{wattageUpdatedAt}
			{wattageStale}
			statusDeviceCount={statusDeviceIds.length}
			on:close={() => (showAdvancedInformation = false)}
		>
			<AdvancedInformation
				{clearDeviceCache}
				{cacheClearing}
				{cacheMessage}
				{diagnosticProblemCount}
				{diagnosticGroups}
				{wattageDisabled}
				{wattageError}
				{wattageSummary}
				{wattageDebug}
				{wattageDevices}
				{formatWatts}
			/>
		</DebugInformation>
	{/if}
{/if}
{#if editorVisited}
	<SceneIdEditor
		visible={selectedTab === 'advanced' &&
			advancedUnlocked &&
			showAdvancedPanel &&
			showSceneIdEditor}
		activity={markAdvancedActivity}
		on:controls={({ detail }) => handleSceneControlsUpdate(detail)}
		on:configuration={({
			detail
		}: CustomEvent<{ controls: DashboardControl[]; tabs: DashboardTab[] }>) => {
			sceneControls = detail.controls;
			dashboardTabs = detail.tabs;
		}}
		on:close={() => (showSceneIdEditor = false)}
	/>
{/if}

<style>
	.gang-control-options {
		grid-template-columns: minmax(0, 1fr) repeat(3, minmax(0, 0.666667fr));
	}

	@media (max-width: 700px) {
		.dashboard-content {
			flex-direction: column;
		}
	}
</style>
