import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ENGINE_TIMEOUT_MS } from '../../../core/src/libs/page-globals';
import { scheduleDeferredEngine, takeEarlyTaps } from '../browser/trigger';

let hero: HTMLImageElement;

beforeEach(() => {
	document.body.innerHTML = `
		<img fetchpriority="high" src="/hero.png" alt="">
		<div data-testid="consent-banner-overlay" tabindex="-1"></div>
		<div data-testid="consent-banner-root">
			<button data-inth-action="accept" type="button">Accept</button>
		</div>
		<p id="outside" tabindex="-1">Article</p>
	`;
	hero = document.querySelector('img') as HTMLImageElement;
	Object.defineProperty(hero, 'complete', { configurable: true, value: false });
});

afterEach(() => {
	vi.useRealTimers();
	Reflect.deleteProperty(window, '__inthEarlyTaps');
});

describe('scheduleDeferredEngine', () => {
	it('starts once the priority images have loaded', () => {
		const start = vi.fn();
		scheduleDeferredEngine(start, vi.fn());
		expect(start).not.toHaveBeenCalled();
		hero.dispatchEvent(new Event('error'));
		hero.dispatchEvent(new Event('load'));
		expect(start).toHaveBeenCalledOnce();
	});

	it('routes presses on the banner and wakes on input elsewhere', () => {
		const start = vi.fn();
		const onPress = vi.fn();
		scheduleDeferredEngine(start, onPress);
		document
			.querySelector('[data-inth-action="accept"]')
			?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(onPress).toHaveBeenCalledWith('accept');
		expect(start).not.toHaveBeenCalled();
		window.dispatchEvent(new Event('keydown'));
		expect(start).toHaveBeenCalledOnce();
		window.dispatchEvent(new Event('scroll'));
		expect(start).toHaveBeenCalledOnce();
	});

	it('wakes on focus on the overlay, and after the ceiling', () => {
		vi.useFakeTimers();
		const focused = vi.fn();
		scheduleDeferredEngine(focused, vi.fn());
		(
			document.querySelector(
				'[data-testid="consent-banner-overlay"]'
			) as HTMLElement
		).focus();
		expect(focused).toHaveBeenCalledOnce();

		const timed = vi.fn();
		scheduleDeferredEngine(timed, vi.fn());
		vi.advanceTimersByTime(ENGINE_TIMEOUT_MS);
		expect(timed).toHaveBeenCalledOnce();
	});

	it('starts at once without priority images to wait for', () => {
		hero.remove();
		const start = vi.fn();
		scheduleDeferredEngine(start, vi.fn());
		expect(start).toHaveBeenCalledOnce();
	});

	it('stops listening when stopped', () => {
		const start = vi.fn();
		const stop = scheduleDeferredEngine(start, vi.fn());
		stop();
		hero.dispatchEvent(new Event('load'));
		window.dispatchEvent(new Event('keydown'));
		expect(start).not.toHaveBeenCalled();
	});
});

describe('takeEarlyTaps', () => {
	it('stops the inline script and empties its queue', () => {
		const stop = vi.fn();
		const taps = [{ action: 'accept', at: 1 }];
		(window as unknown as Record<string, unknown>).__inthEarlyTaps = {
			stop,
			taps,
		};
		expect(takeEarlyTaps()).toEqual([{ action: 'accept', at: 1 }]);
		expect(stop).toHaveBeenCalledOnce();
		expect(taps).toHaveLength(0);
	});

	it('returns nothing without the script', () => {
		expect(takeEarlyTaps()).toEqual([]);
	});
});
