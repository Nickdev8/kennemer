import type { RequestHandler } from './$types';
import { roomWattageConfigs, type RoomWattageConfig } from '$lib/config/rooms';
import { fetchShellyJson, ShellyHttpError } from '$lib/server/shelly-http';

declare const WebSocketPair: {
	new (): { 0: WebSocket; 1: WebSocket };
};

const POLL_INTERVAL_MS = 4000;

type ReadyEvent = {
	type: 'ready';
	roomId: string;
	label: string;
};

type PowerEvent = {
	type: 'power';
	roomId: string;
	watts: number;
	timestamp: number;
};

type ErrorEvent = {
	type: 'error';
	roomId: string;
	message: string;
};

type WattageEvent = ReadyEvent | PowerEvent | ErrorEvent;

class RoomWattageStream {
	private interval: ReturnType<typeof setInterval> | null = null;
	private closed = false;
	private lastError: string | null = null;

	constructor(private socket: WebSocket, private config: RoomWattageConfig) {
		this.socket.addEventListener('close', () => this.stop());
		this.socket.addEventListener('error', () => this.stop());
		this.send({ type: 'ready', roomId: config.id, label: config.label });
		void this.pushReading();
		this.interval = setInterval(() => {
			void this.pushReading();
		}, POLL_INTERVAL_MS);
	}

	private async pushReading() {
		if (this.closed) return;

		try {
			const watts = await this.fetchCurrentWatts();
			if (watts === null) {
				this.reportError('No wattage data available');
				return;
			}
			this.lastError = null;
			this.send({
				type: 'power',
				roomId: this.config.id,
				watts,
				timestamp: Date.now()
			});
		} catch (error) {
			const message = error instanceof ShellyHttpError
				? error.message
				: error instanceof Error
				? error.message
				: 'Unknown wattage error';
			this.reportError(message);
		}
	}

	private async fetchCurrentWatts(): Promise<number | null> {
		let total = 0;
		let hasValue = false;

		for (const target of this.config.sources) {
			const payload = await fetchShellyJson(target);
			const value = extractWattage(payload);
			if (typeof value === 'number' && Number.isFinite(value)) {
				total += value;
				hasValue = true;
			}
		}

		if (!hasValue) {
			return null;
		}

		return total;
	}

	private send(event: WattageEvent) {
		if (this.closed) return;
		try {
			this.socket.send(JSON.stringify(event));
		} catch (err) {
			console.error('Failed to send wattage event', err);
			this.stop();
		}
	}

	private reportError(message: string) {
		if (this.closed) return;
		if (this.lastError === message) return;
		this.lastError = message;
		this.send({ type: 'error', roomId: this.config.id, message });
	}

	private stop() {
		if (this.closed) return;
		this.closed = true;
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}
}

function extractWattage(payload: unknown): number | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const source = payload as Record<string, unknown>;
	const candidates: Array<unknown> = [
		source.apower,
		source.power,
		source.watt,
		source.watts,
		getNestedValue(source, ['data', 'power']),
		getNestedValue(source, ['data', 'total_power']),
		getNestedValue(source, ['data', 'device_status', 'switch:0', 'apower']),
		getNestedValue(source, ['data', 'device_status', 'relay:0', 'apower']),
		getNestedValue(source, ['data', 'device_status', 'pm1:0', 'apower']),
		getNestedValue(source, ['data', 'device_status', 'em:0', 'apower']),
		getNestedValue(source, ['data', 'device_status', 'switch0', 'apower']),
		getNestedValue(source, ['data', 'device_status', 'relay0', 'apower']),
		getNestedArrayValue(source, ['data', 'meters'], 'power'),
		getNestedArrayValue(source, ['data', 'emeters'], 'apower'),
		getNestedArrayValue(source, ['data', 'consumption'], 'a_power'),
		getNestedArrayValue(source, ['meters'], 'power'),
		getNestedArrayValue(source, ['emeters'], 'apower')
	];

	for (const candidate of candidates) {
		if (typeof candidate === 'number' && Number.isFinite(candidate)) {
			return candidate;
		}
	}

	return null;
}

function getNestedValue(source: Record<string, unknown>, path: Array<string | number>) {
	let current: unknown = source;
	for (const segment of path) {
		if (!current || typeof current !== 'object') {
			return undefined;
		}
		if (typeof segment === 'number') {
			if (!Array.isArray(current)) return undefined;
			current = current[segment];
			continue;
		}
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

function getNestedArrayValue(
	source: Record<string, unknown>,
	path: Array<string | number>,
	key: string
) {
	const target = getNestedValue(source, path);
	if (!Array.isArray(target)) return undefined;
	for (const entry of target) {
		if (!entry || typeof entry !== 'object') continue;
		const value = (entry as Record<string, unknown>)[key];
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
	}
	return undefined;
}

export const GET: RequestHandler = ({ request, params }) => {
	if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
		return new Response('Expected WebSocket upgrade', { status: 400 });
	}

	const roomId = params.room;
	const config = roomWattageConfigs.find((item) => item.id === roomId);

	if (!config) {
		return new Response('Unknown room', { status: 404 });
	}

	const { 0: client, 1: server } = new WebSocketPair();
	const serverSocket = server as WebSocket & { accept?: () => void };
	serverSocket.accept?.();

	new RoomWattageStream(serverSocket, config);

	return new Response(null, {
		status: 101,
		// Cast required because ResponseInit does not yet include the webSocket property.
		webSocket: client
	} as ResponseInit & { webSocket: WebSocket });
};
