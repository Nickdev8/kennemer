<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import DeviceCard from '$lib/components/device-card.svelte';
	import TimedTriggerCard from '$lib/components/timed-trigger-card.svelte';
	import TriggerCard from '$lib/components/trigger-card.svelte';
	import type { DashboardControl, DeviceCommandKey, ShellyDevice } from '$lib/config/schema';

	export let control: DashboardControl;
	export let commandOrder: DeviceCommandKey[];
	export let commandKey: (deviceId: string, command: DeviceCommandKey) => string;
	export let commandLabel: (device: ShellyDevice, command: DeviceCommandKey) => string;
	export let loadingCommandKeys: ReadonlySet<string> = new Set();
	export let loadingTriggerIds: ReadonlySet<string> = new Set();
	export let initialStatus: DeviceCommandKey | null = null;
	export let transientActive = false;
	export let activeUntil: number | null = null;
	export let resolveToggleCommand: (status: DeviceCommandKey | null) => DeviceCommandKey = (
		status
	) => (status === 'on' ? 'off' : 'on');

	const dispatch = createEventDispatcher<{
		command: { deviceId: string; command: DeviceCommandKey };
		trigger: { triggerId: string };
	}>();
</script>

{#if control.controlType === 'device'}
	<DeviceCard
		device={control}
		{commandOrder}
		{commandKey}
		{commandLabel}
		{resolveToggleCommand}
		{loadingCommandKeys}
		{initialStatus}
		{transientActive}
		on:command={({ detail }) => dispatch('command', detail)}
	/>
{:else if control.controlType === 'timed-trigger'}
	<TimedTriggerCard
		trigger={control}
		{loadingTriggerIds}
		{activeUntil}
		on:trigger={({ detail }) => dispatch('trigger', detail)}
	/>
{:else}
	<TriggerCard
		trigger={control}
		{loadingTriggerIds}
		on:trigger={({ detail }) => dispatch('trigger', detail)}
	/>
{/if}
