import { readFile } from 'node:fs/promises';
import { env } from '$env/dynamic/private';
import { inventory, controls } from '$lib/config/registry';
import type { DeviceCommandKey } from '$lib/config/schema';
import { directTarget, parseDirectOutput } from '$lib/config/direct-device';

async function target(id: string, method: 'GetStatus' | 'Set', command?: DeviceCommandKey) {
	const match = /^([a-f0-9]{12})(?:_(\d+))?$/i.exec(id);
	const registered = controls.some(
		(entry) => entry.controlType === 'device' && entry.directDeviceId === id
	);
	const device =
		inventory.find((entry) => entry.id === id) ??
		(registered && match
			? { id, label: id, ip: '', component: 'switch' as const, channel: Number(match[2] ?? 0) }
			: undefined);
	if (!device?.component || device.channel === undefined)
		throw new Error('Apparaat is niet geconfigureerd.');
	let ip = device.ip;
	const baseId = match?.[1].toLowerCase() ?? id.toLowerCase();
	try {
		const cache = JSON.parse(await readFile(env.IP_CACHE_PATH ?? 'ips.json', 'utf8'));
		const devices = cache.devices ?? cache;
		const cached = Array.isArray(devices)
			? devices.find((entry) => entry.id?.toLowerCase() === baseId)
			: Object.entries(devices).find(
					([key, entry]) =>
						key.toLowerCase() === baseId || (entry as { id?: string })?.id?.toLowerCase() === baseId
				)?.[1];
		const candidate =
			typeof cached === 'string'
				? cached
				: ((cached as { ip?: string; local_ip?: string; lan_ip?: string; address?: string })?.ip ??
					(cached as { local_ip?: string })?.local_ip ??
					(cached as { lan_ip?: string })?.lan_ip ??
					(cached as { address?: string })?.address);
		if (typeof candidate === 'string' && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(candidate))
			ip = candidate;
	} catch {}
	if (!ip) throw new Error('LAN-adres ontbreekt in de apparaatcache. Vernieuw de apparaatcache.');
	return directTarget({ ...device, ip }, method, command);
}
async function request(id: string, method: 'GetStatus' | 'Set', command?: DeviceCommandKey) {
	const { url, payload } = await target(id, method, command);
	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(4000)
		});
	} catch (error) {
		const name = error instanceof Error ? error.name : '';
		if (name === 'TimeoutError' || name === 'AbortError') {
			throw new Error('Apparaat reageert niet via LAN.');
		}
		throw new Error('Apparaat niet bereikbaar via LAN.');
	}
	if (!response.ok) throw new Error('Apparaat niet bereikbaar via LAN.');
	const result = await response.json();
	if (result.error) throw new Error('Apparaat heeft de opdracht geweigerd.');
	return result;
}
export async function readDirectOutput(id: string): Promise<DeviceCommandKey> {
	return parseDirectOutput(await request(id, 'GetStatus'));
}
export async function sendDirectCommand(id: string, command: DeviceCommandKey): Promise<void> {
	await request(id, 'Set', command);
}
