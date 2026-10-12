import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { env } from '$env/dynamic/private';

type AuditValue = string | number | boolean | string[];

const directory = resolve(
	process.cwd(),
	env.KENNEMER_AUDIT_LOG_DIR ?? (env.NODE_ENV === 'production' ? '/data/logs' : 'audit-logs')
);
const timeZone = env.KENNEMER_AUDIT_TIME_ZONE?.trim() || 'Europe/Amsterdam';
let writeQueue = Promise.resolve();

function auditDate(timestamp: Date) {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(timestamp);
	const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
	const date = `${values.year}-${values.month}-${values.day}`;
	if (Number(values.hour) >= 4) return date;

	const previousDate = new Date(`${date}T00:00:00.000Z`);
	previousDate.setUTCDate(previousDate.getUTCDate() - 1);
	return previousDate.toISOString().slice(0, 10);
}

export function auditFileFor(timestamp: Date) {
	const date = auditDate(timestamp);
	const [year, month] = date.split('-');
	return join(directory, year, month, `${date}.jsonl`);
}

export function recordAuditEvent(
	type: string,
	details: Record<string, AuditValue>,
	timestamp = new Date()
) {
	const task = writeQueue.then(async () => {
		const businessDate = auditDate(timestamp);
		const [year, month] = businessDate.split('-');
		const file = join(directory, year, month, `${businessDate}.jsonl`);
		await mkdir(dirname(file), { recursive: true, mode: 0o700 });
		await appendFile(
			file,
			`${JSON.stringify({ timestamp: timestamp.toISOString(), businessDate, type, ...details })}\n`,
			{ encoding: 'utf8', mode: 0o600 }
		);
	});
	writeQueue = task.catch((error: unknown) => {
		console.error('[audit] Could not write event:', error);
	});
	return task.catch(() => undefined);
}
