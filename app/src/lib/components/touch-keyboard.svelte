<script lang="ts">
	import { onMount, tick } from 'svelte';
	import 'simple-keyboard/build/css/index.css';
	import Keyboard from 'simple-keyboard';
	import type SimpleKeyboard from 'simple-keyboard';
	import type { KeyboardLayoutObject } from 'simple-keyboard';

	type Editable = HTMLInputElement | HTMLTextAreaElement;
	type Layout = 'default' | 'shift' | 'symbols' | 'numeric';

	const textTypes = new Set(['text', 'password', 'search', 'email', 'tel', 'url', 'number']);
	const keyboardLayouts: KeyboardLayoutObject = {
		default: [
			'q w e r t y u i o p {bksp}',
			'a s d f g h j k l {enter}',
			'{shift} z x c v b n m {shift}',
			'{symbols} , {space} . {done}'
		],
		shift: [
			'Q W E R T Y U I O P {bksp}',
			'A S D F G H J K L {enter}',
			'{shift} Z X C V B N M {shift}',
			'{symbols} < {space} > {done}'
		],
		symbols: [
			'1 2 3 4 5 6 7 8 9 0 {bksp}',
			'- / : ; ( ) € & @ " {enter}',
			'{abc} . , ? ! \' [ ] {bksp}',
			'# % & + = _ {space} {done}'
		],
		numeric: [
			'1 2 3',
			'4 5 6',
			'7 8 9',
			'{abc} 0 {bksp}',
			'- . {done}'
		]
	};

	let visible = false;
	let active: Editable | null = null;
	let layout: Layout = 'default';
	let touchSeen = false;
	let mobileBrowser = false;
	let keyboardElement: HTMLDivElement;
	let keyboard: SimpleKeyboard | null = null;

	function editable(target: EventTarget | null): Editable | null {
		if (target instanceof HTMLTextAreaElement) return target.disabled || target.readOnly ? null : target;
		if (target instanceof HTMLInputElement && textTypes.has(target.type)) {
			return target.disabled || target.readOnly ? null : target;
		}
		return null;
	}

	async function show(input: Editable) {
		if (mobileBrowser || !document.contains(input)) return;
		active = input;
		layout = input instanceof HTMLInputElement &&
			(input.type === 'number' || input.inputMode === 'numeric' || input.inputMode === 'decimal' || input.type === 'password')
			? 'numeric' : 'default';
		keyboard?.setOptions({ layoutName: layout });
		visible = true;
		await tick();
		input.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	function insert(value: string, remove = false) {
		const input = active;
		if (!input || !document.contains(input) || input.disabled || input.readOnly) { visible = false; return; }
		const noSelection = input instanceof HTMLInputElement && (input.type === 'number' || input.type === 'email');
		if (noSelection) {
			input.value = remove ? input.value.slice(0, -1) : input.value + value;
		} else {
			const start = input.selectionStart ?? input.value.length;
			const end = input.selectionEnd ?? start;
			const from = remove && start === end ? Math.max(0, start - 1) : start;
			const replacement = remove ? '' : value;
			if (input.maxLength >= 0 && input.value.length - (end - from) + replacement.length > input.maxLength) return;
			input.setRangeText(replacement, from, end, 'end');
		}
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.focus({ preventScroll: true });
	}

	function press(key: string) {
		if (key === '{done}') { visible = false; return; }
		if (key === '{abc}') { layout = 'default'; keyboard?.setOptions({ layoutName: layout }); return; }
		if (key === '{symbols}') { layout = 'symbols'; keyboard?.setOptions({ layoutName: layout }); return; }
		if (key === '{shift}') {
			layout = layout === 'shift' ? 'default' : 'shift';
			keyboard?.setOptions({ layoutName: layout });
			return;
		}
		if (key === '{bksp}') { insert('', true); return; }
		if (key === '{enter}') {
			if (active instanceof HTMLTextAreaElement) insert('\n');
			else visible = false;
			return;
		}
		if (key === '{space}') { insert(' '); return; }
		insert(layout === 'shift' ? key.toUpperCase() : key);
		if (layout === 'shift') {
			layout = 'default';
			keyboard?.setOptions({ layoutName: layout });
		}
	}

	onMount(() => {
		mobileBrowser = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
		if (!mobileBrowser) {
			keyboard = new Keyboard(keyboardElement, {
				layout: keyboardLayouts,
				layoutName: layout,
				theme: 'hg-theme-default kennemer-touch-keyboard',
				display: {
					'{bksp}': '⌫',
					'{done}': 'Gereed',
					'{enter}': '↵',
					'{shift}': '⇧',
					'{symbols}': '?123',
					'{abc}': 'ABC',
					'{space}': 'Spatie'
				},
				useButtonTag: true,
				autoUseTouchEvents: true,
				preventMouseDownDefault: true,
				stopMouseDownPropagation: true,
				disableButtonHold: true,
				onKeyPress: press
			});
		}
		const onPointerDown = (event: PointerEvent) => {
			if (event.pointerType === 'touch') touchSeen = true;
			const element = event.target instanceof Element ? event.target : null;
			if (element?.closest('[data-touch-keyboard]')) return;
			const input = editable(event.target);
			if (input && (touchSeen || navigator.maxTouchPoints > 0)) void show(input);
			else visible = false;
		};
		const onFocusIn = (event: FocusEvent) => {
			const input = editable(event.target);
			if (input && (touchSeen || navigator.maxTouchPoints > 0)) void show(input);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (visible && event.key === 'Escape') visible = false;
		};
		window.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('focusin', onFocusIn, true);
		window.addEventListener('keydown', onKeyDown, true);
		return () => {
			keyboard?.destroy();
			keyboard = null;
			window.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('focusin', onFocusIn, true);
			window.removeEventListener('keydown', onKeyDown, true);
		};
	});
</script>

<div
	class="fixed inset-x-0 bottom-0 z-[100] border-t border-slate-300 bg-slate-100 p-2 shadow-[0_-8px_24px_rgba(15,23,42,0.14)]"
	class:hidden={!visible || mobileBrowser}
	data-touch-keyboard
	role="group"
	aria-label="Schermtoetsenbord"
	aria-hidden={!visible || mobileBrowser}
	on:pointerdown|preventDefault
>
	<div class="mx-auto max-w-5xl">
		<div class="mb-2 flex items-center justify-between px-1 text-sm text-slate-600">
			<span class="font-medium">Toetsenbord</span>
			<button
				type="button"
				class="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
				on:click={() => (visible = false)}
			>
				Sluiten
			</button>
		</div>
		<div bind:this={keyboardElement}></div>
	</div>
</div>

<style>
	:global(.kennemer-touch-keyboard .hg-rows) {
		gap: 0.35rem;
	}

	:global(.kennemer-touch-keyboard .hg-row) {
		gap: 0.35rem;
	}

	:global(.kennemer-touch-keyboard .hg-button) {
		min-height: 3.25rem;
		border: 1px solid #cbd5e1;
		border-radius: 0.55rem;
		background: #fff;
		color: #0f172a;
		font-size: 1.1rem;
		font-weight: 600;
		box-shadow: 0 1px 0 #94a3b8;
	}

	:global(.kennemer-touch-keyboard .hg-button:active) {
		background: #e2e8f0;
		box-shadow: inset 0 1px 2px rgb(15 23 42 / 12%);
	}

	:global(.kennemer-touch-keyboard .hg-button[data-skbtn="{space}"]) {
		flex: 4;
		max-width: none;
	}

	:global(.kennemer-touch-keyboard .hg-button[data-skbtn="{done}"]) {
		background: #1e293b;
		color: #fff;
	}
</style>
