import test from 'node:test';
import assert from 'node:assert/strict';
import {
	bellScheduleView,
	formatBellCountdown,
	parseBellTime
} from '../src/lib/dashboard/bell-schedule.ts';
const now = Date.parse('2026-11-09T09:00:00Z');
const config = {
	paused: false,
	active_profile: 'regular',
	weekdays: [0, 1, 2, 3, 4],
	timezone: 'Europe/Amsterdam',
	profiles: { regular: ['11:00', '09:00', '10:10x2'], short: ['12:00'], empty: [] }
};
const status = {
	paused: false,
	active_profile: 'regular',
	next_event: { at: '2026-11-09T09:10:00Z', profile: 'regular', time: '10:10', count: 2 }
};
test('selected roster only is sorted; only host-backed matching next event is highlighted', () => {
	const regular = bellScheduleView(config, status, 'regular', now);
	assert.deepEqual(
		regular.entries.map((entry) => entry.time),
		['09:00', '10:10', '11:00']
	);
	assert.equal(regular.entries.find((entry) => entry.next).count, 2);
	assert.equal(regular.countdown, '00:10:00');
	assert.equal(regular.entries[0].passed, true);
	assert.equal(regular.entries[1].passed, false);
	const selected = bellScheduleView(config, status, 'short', now);
	assert.deepEqual(
		selected.entries.map((entry) => entry.time),
		['12:00']
	);
	assert.ok(selected.entries.every((entry) => !entry.next));
	assert.equal(selected.next.profile, 'regular');
	assert.equal(selected.runningProfile, 'regular');
});
test('off, empty, finished and inactive weekdays have distinct states', () => {
	assert.equal(bellScheduleView(config, status, 'off', now).dayState, 'off');
	assert.equal(bellScheduleView(config, status, 'empty', now).dayState, 'empty');
	assert.equal(
		bellScheduleView(config, null, 'regular', Date.parse('2026-11-09T16:00:00Z')).dayState,
		'finished'
	);
	assert.equal(
		bellScheduleView(config, null, 'regular', Date.parse('2026-11-08T09:00:00Z')).dayState,
		'inactive-day'
	);
	assert.equal(
		bellScheduleView({ ...config, paused: true }, { ...status, paused: true }, 'regular', now).next,
		null
	);
});
test('stale, failed, mismatched and unsynchronized status never show a live countdown', () => {
	assert.equal(bellScheduleView(config, status, 'regular', now, true).next, null);
	assert.equal(
		bellScheduleView(config, { ...status, clock: { synchronized: false } }, 'regular', now).next,
		null
	);
	assert.equal(
		bellScheduleView(
			config,
			{ ...status, next_event: { ...status.next_event, profile: 'short' } },
			'regular',
			now
		).next,
		null
	);
	assert.equal(
		bellScheduleView(config, status, 'regular', Date.parse(status.next_event.at)).next,
		null
	);
	assert.equal(
		bellScheduleView(
			config,
			{ ...status, next_event: { ...status.next_event, at: 'invalid' } },
			'regular',
			now
		).next,
		null
	);
});
test('future-day next events do not highlight today and countdown follows absolute host time over DST', () => {
	const tomorrow = { ...status, next_event: { ...status.next_event, at: '2026-11-10T09:10:00Z' } };
	assert.ok(
		bellScheduleView(config, tomorrow, 'regular', now).entries.every((entry) => !entry.next)
	);
	const autumn = {
		...status,
		next_event: { at: '2026-10-25T01:30:00Z', time: '02:30', profile: 'regular' }
	};
	const view = bellScheduleView(
		{ ...config, weekdays: [6] },
		autumn,
		'regular',
		Date.parse('2026-10-25T00:15:00Z')
	);
	assert.equal(view.nextTime, '02:30');
	assert.equal(view.countdown, '01:15:00');
	assert.equal(view.todayEnabled, true);
});
test('countdown handles days, subsecond boundary and elapsed event; legacy/object times preserve double bells', () => {
	assert.equal(formatBellCountdown(90061000), '1 dag · 01:01:01');
	assert.equal(formatBellCountdown(1), '00:00:01');
	assert.equal(formatBellCountdown(-1), '00:00:00');
	assert.deepEqual(parseBellTime('10:10x2'), { time: '10:10', count: 2 });
	assert.deepEqual(parseBellTime({ time: '10:10', count: 2 }), { time: '10:10', count: 2 });
});
