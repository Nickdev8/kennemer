export type BellTime = string | { time: string; count?: number };
export type BellScheduleConfig = {
	paused: boolean;
	active_profile: string;
	weekdays: number[];
	profiles: Record<string, BellTime[]>;
	timezone: string;
};
export type ScheduledBell = { at: string; profile: string; time: string; count?: number };
export type BellStatus = {
	paused?: boolean;
	active_profile?: string;
	next_event?: ScheduledBell | null;
	preview?: boolean;
	last_outcome?: unknown;
	clock?: { synchronized?: boolean; timezone?: string };
};

export function parseBellTime(value: BellTime): { time: string; count: 1 | 2 } {
	const match = /^(\d{2}:\d{2})(?:x([12]))?$/.exec(typeof value === 'string' ? value : value.time);
	return {
		time: match?.[1] ?? '08:00',
		count: (typeof value === 'string' ? match?.[2] === '2' : value.count === 2) ? 2 : 1
	};
}

function calendarAt(timestamp: number, timezone: string) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-GB', {
			timeZone: timezone,
			weekday: 'short',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(timestamp)
			.map((part) => [part.type, part.value])
	);
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday),
		time: `${parts.hour}:${parts.minute}`,
		seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)
	};
}

export function formatBellCountdown(milliseconds: number) {
	const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
	const days = Math.floor(seconds / 86400);
	const clock = [Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60]
		.map((value) => String(value).padStart(2, '0'))
		.join(':');
	return `${days ? `${days} ${days === 1 ? 'dag' : 'dagen'} · ` : ''}${clock}`;
}

export function bellScheduleView(
	config: BellScheduleConfig | null,
	status: BellStatus | null,
	selectedMode: string,
	now: number,
	unavailable = false
) {
	let timezone = config?.timezone || 'Europe/Amsterdam';
	try {
		new Intl.DateTimeFormat('nl-NL', { timeZone: timezone }).format(now);
	} catch {
		timezone = 'Europe/Amsterdam';
	}
	const today = calendarAt(now, timezone);
	const runningProfile =
		(status?.paused ?? config?.paused ?? true)
			? null
			: (status?.active_profile ?? config?.active_profile ?? null);
	const rawNext = status?.next_event;
	const nextAt = rawNext ? Date.parse(rawNext.at) : NaN;
	const next =
		!unavailable &&
		status?.clock?.synchronized !== false &&
		runningProfile &&
		rawNext?.profile === runningProfile &&
		Number.isFinite(nextAt) &&
		nextAt > now
			? rawNext
			: null;
	const nextCalendar = next ? calendarAt(nextAt, timezone) : null;
	const todayEnabled = Boolean(config?.weekdays.includes(today.weekday));
	const entries =
		selectedMode === 'off'
			? []
			: (config?.profiles[selectedMode] ?? [])
					.map(parseBellTime)
					.sort((a, b) => a.time.localeCompare(b.time))
					.map((entry) => ({
						...entry,
						next: Boolean(
							next &&
								next.profile === selectedMode &&
								nextCalendar?.date === today.date &&
								entry.time === nextCalendar.time
						),
						passed:
							Number(entry.time.slice(0, 2)) * 3600 + Number(entry.time.slice(3)) * 60 <
							today.seconds
					}));
	const dayState =
		selectedMode === 'off'
			? 'off'
			: !entries.length
				? 'empty'
				: !todayEnabled
					? 'inactive-day'
					: entries.every((entry) => entry.time <= today.time)
						? 'finished'
						: 'scheduled';
	return {
		timezone,
		runningProfile,
		entries,
		dayState,
		todayEnabled,
		next,
		countdown: next ? formatBellCountdown(nextAt - now) : null,
		nextTime: next ? nextCalendar?.time : null,
		nextDate: next
			? new Intl.DateTimeFormat('nl-NL', {
					timeZone: timezone,
					weekday: 'long',
					day: 'numeric',
					month: 'long'
				}).format(nextAt)
			: null
	};
}
