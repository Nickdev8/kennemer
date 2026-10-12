import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { env } from '$env/dynamic/private';

const path = resolve(
	process.cwd(),
	env.KENNEMER_TIMED_TRIGGER_PATH ??
		(env.NODE_ENV === 'production' ? '/data/timed-triggers.json' : 'timed-triggers.json')
);
let mutationQueue = Promise.resolve();

async function readStore(): Promise<Record<string, number>> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('Timerstatus bevat geen object.');
		}
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, number] =>
					typeof entry[0] === 'string' &&
					typeof entry[1] === 'number' &&
					Number.isFinite(entry[1]) &&
					entry[1] > 0
			)
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
		console.error('[timer] Could not read saved timer state:', error);
		return {};
	}
}

export async function readActiveTimedTriggers(validIds: ReadonlySet<string>) {
	const saved = await readStore();
	const now = Date.now();
	return Object.fromEntries(
		Object.entries(saved).filter(([id, activeUntil]) => validIds.has(id) && activeUntil > now)
	);
}

export function saveTimedTrigger(id: string, activeUntil: number) {
	const task = mutationQueue.then(async () => {
		const now = Date.now();
		const next = Object.fromEntries(
			Object.entries(await readStore()).filter(([, savedUntil]) => savedUntil > now)
		);
		next[id] = activeUntil;
		await mkdir(dirname(path), { recursive: true, mode: 0o700 });
		await writeFileAtomic(path, JSON.stringify(next, null, 2), {
			encoding: 'utf8',
			fsync: true
		});
	});
	mutationQueue = task.catch((error: unknown) => {
		console.error('[timer] Could not save timer state:', error);
	});
	return task;
}
