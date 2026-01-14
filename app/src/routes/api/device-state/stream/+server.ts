import type { RequestHandler } from './$types';
import { readDeviceStates } from '$lib/server/device-state-store';
import { subscribeDeviceState, unsubscribeDeviceState } from '$lib/server/device-state-events';

export const GET: RequestHandler = async () => {
	const encoder = new TextEncoder();
	const states = await readDeviceStates();

	let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controllerRef = controller;
			subscribeDeviceState(controller);
			controller.enqueue(
				encoder.encode(`event: init\ndata: ${JSON.stringify(states)}\n\n`)
			);
			heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					if (controllerRef) {
						unsubscribeDeviceState(controllerRef);
					}
					if (heartbeat) {
						clearInterval(heartbeat);
						heartbeat = null;
					}
				}
			}, 20000);
		},
		cancel() {
			if (controllerRef) {
				unsubscribeDeviceState(controllerRef);
			}
			if (heartbeat) {
				clearInterval(heartbeat);
			}
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive'
		}
	});
};
