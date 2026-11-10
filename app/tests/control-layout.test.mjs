import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlPages } from '../src/lib/dashboard/control-layout.ts';
const ids = ['gangcolorgroup', 'gangcolor-830', 'gangcolor-865', 'gangcolor-paars'];
const controls = [...ids, ...Array.from({ length: 14 }, (_, i) => `device-${i}`)].map((id) => ({
	id
}));
test('Gang controls form the first full row without losing registered controls across pages', () => {
	const pages = controlPages(controls, 'devices');
	assert.deepEqual(
		pages.map((page) => page.length),
		[7, 8]
	);
	assert.deepEqual(
		pages[0][0].controls.map((c) => c.id),
		ids
	);
	assert.equal(pages[0][0].wide, true);
	assert.deepEqual(
		pages.flatMap((page) => page.flatMap((group) => group.controls)),
		controls
	);
});
test('Partial/moved groups and other tabs retain independent controls', () => {
	const moved = controls.filter((c) => c.id !== 'gangcolor-865');
	assert.ok(
		controlPages(moved, 'devices')
			.flat()
			.every((group) => !group.wide)
	);
	assert.ok(
		controlPages(controls, 'home')
			.flat()
			.every((group) => !group.wide)
	);
});
