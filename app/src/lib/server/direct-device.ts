import { readFile } from 'node:fs/promises';
import { env } from '$env/dynamic/private';
import { inventory } from '$lib/config/registry';
import type { DeviceCommandKey } from '$lib/config/schema';
import { directTarget, parseDirectOutput } from '$lib/config/direct-device';

async function target(id: string, method: 'GetStatus' | 'Set', command?: DeviceCommandKey) {
	const device = inventory.find((entry) => entry.id === id);
	if (!device?.component || device.channel === undefined)
		throw new Error('Apparaat is niet geconfigureerd.');
	let ip = device.ip;
	try {
		const cache = JSON.parse(await readFile(env.IP_CACHE_PATH ?? 'ips.json', 'utf8'));
		const devices = cache.devices ?? cache;
		const cached = Array.isArray(devices) ? devices.find((entry) => entry.id === id) : devices[id];
		const candidate = typeof cached === 'string' ? cached : cached?.ip;
		if (typeof candidate === 'string' && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(candidate))
			ip = candidate;
	} catch {}
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
