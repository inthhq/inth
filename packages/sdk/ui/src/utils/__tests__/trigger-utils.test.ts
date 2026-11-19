import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	createTriggerDrag,
	getPersistedPosition,
	isTriggerVisible,
	nextToolbarItem,
	onSnapEnd,
	toolbarOrder,
} from '../trigger-utils';

describe('isTriggerVisible', () => {
	const shown = {
		dialogOpen: false,
		hasConsentPreferences: true,
		promptOwed: false,
		showWhen: 'always' as const,
	};

	test('shows beside an open banner, but not over the dialog', () => {
		expect(isTriggerVisible({ ...shown, promptOwed: true })).toBe(true);
		expect(isTriggerVisible({ ...shown, dialogOpen: true })).toBe(false);
	});

	test('after-consent waits until no prompt is owed', () => {
		expect(
			isTriggerVisible({
				...shown,
				promptOwed: true,
				showWhen: 'after-consent',
			})
		).toBe(false);
		expect(isTriggerVisible({ ...shown, showWhen: 'after-consent' })).toBe(
			true
		);
	});

	test('hides for never and with nothing to manage', () => {
		expect(isTriggerVisible({ ...shown, showWhen: 'never' })).toBe(false);
		expect(isTriggerVisible({ ...shown, hasConsentPreferences: false })).toBe(
			false
		);
	});
});

test('toolbarOrder keeps preferences in the corner', () => {
	expect(toolbarOrder('bottom-left')).toEqual(['preferences', 'devtools']);
	expect(toolbarOrder('top-right')).toEqual(['devtools', 'preferences']);
	expect(toolbarOrder('top-right', 'vertical')).toEqual([
		'preferences',
		'devtools',
	]);
});

describe('nextToolbarItem', () => {
	const items = ['a', 'b', 'c'];

	test('arrows step and wrap along the orientation', () => {
		expect(nextToolbarItem(items, 'c', 'ArrowRight')).toBe('a');
		expect(nextToolbarItem(items, 'a', 'ArrowLeft')).toBe('c');
		expect(nextToolbarItem(items, 'a', 'ArrowDown', 'vertical')).toBe('b');
		expect(nextToolbarItem(items, 'a', 'ArrowDown')).toBeUndefined();
	});

	test('Home and End jump to the ends; other keys are ignored', () => {
		expect(nextToolbarItem(items, 'b', 'Home')).toBe('a');
		expect(nextToolbarItem(items, 'b', 'End')).toBe('c');
		expect(nextToolbarItem(items, 'b', 'Enter')).toBeUndefined();
	});
});

describe('createTriggerDrag', () => {
	afterEach(() => {
		localStorage.clear();
	});

	const pointer = (clientX: number, clientY = 0) => ({
		button: 0,
		clientX,
		clientY,
		currentTarget: null,
		pointerId: 1,
		target: null,
	});
	const setup = (persist = true) => {
		let corner: 'bottom-right' | 'bottom-left' = 'bottom-right';
		const onCorner = vi.fn((next: typeof corner) => {
			corner = next;
		});
		const drag = createTriggerDrag({
			corner: () => corner,
			onCorner,
			persist: () => persist,
		});
		return { drag, onCorner };
	};

	test('a drag past the slop snaps to the corner it moves toward', () => {
		const { drag, onCorner } = setup();
		drag.pointerDown(pointer(500));
		drag.pointerMove(pointer(440));
		drag.pointerUp(pointer(440));
		expect(onCorner).toHaveBeenCalledWith('bottom-left');
		expect(getPersistedPosition()).toBe('bottom-left');
	});

	test('a press that stays within the slop is a click', () => {
		const { drag, onCorner } = setup();
		drag.pointerDown(pointer(500));
		drag.pointerMove(pointer(503));
		drag.pointerUp(pointer(503));
		expect(onCorner).not.toHaveBeenCalled();
		expect(drag.endsDrag({ detail: 1 })).toBe(false);
	});

	test('only the pointer click ending a drag is ignored', () => {
		const { drag } = setup(false);
		drag.pointerDown(pointer(500));
		drag.pointerMove(pointer(440));
		drag.pointerUp(pointer(440));
		expect(getPersistedPosition()).toBeNull();
		expect(drag.endsDrag({ detail: 1 })).toBe(true);
		expect(drag.endsDrag({ detail: 1 })).toBe(false);
	});

	test('a keyboard click right after a drag is a request', () => {
		const { drag } = setup();
		drag.pointerDown(pointer(500));
		drag.pointerMove(pointer(440));
		drag.pointerUp(pointer(440));
		expect(drag.endsDrag({ detail: 0 })).toBe(false);
	});
});

describe('onSnapEnd', () => {
	afterEach(() => {
		vi.useRealTimers();
		document.body.replaceChildren();
	});

	test('ends on the element’s own transitionend, once', () => {
		vi.useFakeTimers();
		const element = document.createElement('div');
		element.style.transitionDuration = '2s';
		const child = document.createElement('span');
		element.append(child);
		document.body.append(element);
		const done = vi.fn();
		onSnapEnd(element, done);

		child.dispatchEvent(new Event('transitionend', { bubbles: true }));
		expect(done).not.toHaveBeenCalled();
		element.dispatchEvent(new Event('transitionend'));
		element.dispatchEvent(new Event('transitionend'));
		vi.runAllTimers();
		expect(done).toHaveBeenCalledTimes(1);
	});

	test('falls back to the computed transition time when no event fires', () => {
		vi.useFakeTimers();
		const element = document.createElement('div');
		element.style.transitionDuration = '400ms';
		document.body.append(element);
		const done = vi.fn();
		onSnapEnd(element, done);

		vi.advanceTimersByTime(400);
		expect(done).not.toHaveBeenCalled();
		vi.advanceTimersByTime(50);
		expect(done).toHaveBeenCalledTimes(1);
	});

	test('cancels without calling done', () => {
		vi.useFakeTimers();
		const element = document.createElement('div');
		document.body.append(element);
		const done = vi.fn();
		onSnapEnd(element, done)();
		vi.runAllTimers();
		element.dispatchEvent(new Event('transitionend'));
		expect(done).not.toHaveBeenCalled();
	});
});
