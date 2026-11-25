/**
 * Focus return for a closing surface (FOC-03), in jsdom. jsdom lays
 * nothing out, so a control the page hides with CSS is modelled by a
 * `focus()` that does not land, as the browser does for `display: none`.
 */
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { restoreFocus, takesFocus } from '../surface';

const button = (testId?: string, parent: Node = document.body) => {
	const element = document.createElement('button');
	if (testId) {
		element.dataset.testid = testId;
	}
	parent.appendChild(element);
	return element;
};
const cannotTakeFocus = (element: HTMLElement) =>
	vi.spyOn(element, 'focus').mockImplementation(() => undefined);

const FALLBACKS = [
	'[data-testid="privacy-choices-link"]',
	'[data-testid="consent-dialog-trigger"]',
];

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe('restoreFocus', () => {
	test('returns focus to an opener that takes it', () => {
		const opener = button();
		button('privacy-choices-link');
		expect(restoreFocus({ fallbacks: FALLBACKS, opener })).toBe(opener);
		expect(document.activeElement).toBe(opener);
	});

	test('skips a connected opener that cannot take focus, and a hidden fallback', () => {
		const opener = button('privacy-choices-link');
		cannotTakeFocus(opener);
		const trigger = button('consent-dialog-trigger');
		expect(restoreFocus({ fallbacks: FALLBACKS, opener })).toBe(trigger);
		expect(document.activeElement).toBe(trigger);
	});

	test('skips an unmounted opener, and the body', () => {
		const opener = button();
		opener.remove();
		const link = button('privacy-choices-link');
		expect(restoreFocus({ fallbacks: FALLBACKS, opener })).toBe(link);
		expect(restoreFocus({ opener: document.body })).toBeNull();
	});

	test('tries every match of a selector before the next one', () => {
		cannotTakeFocus(button('privacy-choices-link'));
		const second = button('privacy-choices-link');
		button('consent-dialog-trigger');
		expect(restoreFocus({ fallbacks: FALLBACKS })).toBe(second);
	});

	test('looks into the shadow root the UI mounts in', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const shadow = host.attachShadow({ mode: 'open' });
		const inside = button(undefined, shadow);
		const trigger = button('consent-dialog-trigger', shadow);
		expect(restoreFocus({ fallbacks: FALLBACKS, root: inside })).toBe(trigger);
		expect(takesFocus(trigger)).toBe(true);
	});

	test('returns null when nothing takes focus', () => {
		cannotTakeFocus(button('privacy-choices-link'));
		expect(restoreFocus({ fallbacks: FALLBACKS })).toBeNull();
	});
});
