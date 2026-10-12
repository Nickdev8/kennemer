/** Owns recurring idle-sensitive polls. In-flight requests retain their own guards. */
export function createPollingGroup(
	tasks: Array<{ intervalMs: number; run: () => void | Promise<void> }>
) {
	let timers: Array<ReturnType<typeof setInterval>> = [];
	return {
		start() {
			if (timers.length) return;
			timers = tasks.map(({ intervalMs, run }) => setInterval(() => void run(), intervalMs));
		},
		pause() {
			timers.forEach(clearInterval);
			timers = [];
		}
	};
}
