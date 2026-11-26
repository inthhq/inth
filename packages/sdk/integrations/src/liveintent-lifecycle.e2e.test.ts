/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { npmAndRemote } from './__tests__/remote-path';
import {
	ALL_DENIED,
	grantedMarketingConsents,
	grantedMeasurementConsents,
	installHeadProbe,
	loadScripts,
	registerVendorContractCleanup,
	settleScripts,
	updateScripts,
} from './e2e-test-utils';
import { liveIntentTag } from './vendors/ads-and-pixels/liveintent';
import type { LiveIntentEvent } from './vendors/ads-and-pixels/liveintent';

const conversion: LiveIntentEvent = {
	amount: 12.5,
	conversionId: 'order-1',
	currency: 'USD',
	event: 'conversion',
	items: [{ currency: 'USD', id: 'sku-1', price: 12.5, quantity: 1 }],
	name: 'product_purchase',
};
const vendorGlobals = ['liQ', 'LI', 'lc2', 'liQHub', 'liQ_instances'];

describe('LiveIntent production core loader contract', () => {
	registerVendorContractCleanup();
	afterEach(() => {
		for (const key of ['lc2', 'liQHub', 'liQ_instances']) {
			Reflect.deleteProperty(window, key);
		}
	});

	it('defers event queues, loader nodes and storage until marketing consent', () => {
		const append = vi.fn();
		installHeadProbe(append);
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const getItem = vi.spyOn(Storage.prototype, 'getItem');
		const cookieWrite = vi.spyOn(document, 'cookie', 'set');
		const scripts = [
			liveIntentTag({ events: [conversion], tagId: 'inth-tag' }),
		];
		expect(loadScripts(scripts, ALL_DENIED)).toEqual([]);
		expect(updateScripts(scripts, grantedMeasurementConsents).loaded).toEqual(
			[]
		);
		for (const key of vendorGlobals) {
			expect(key in window).toBe(false);
		}
		expect(append).not.toHaveBeenCalled();
		expect(document.querySelector('script, img, iframe, link')).toBeNull();
		expect(setItem).not.toHaveBeenCalled();
		expect(getItem).not.toHaveBeenCalled();
		expect(cookieWrite).not.toHaveBeenCalled();
		updateScripts(scripts, grantedMarketingConsents);
		expect(window.liQ).toEqual([conversion]);
		expect(append).toHaveBeenCalledOnce();
	});

	it('queues the exact event objects in order before the account script is inserted', () => {
		const second = { event: 'conversion', name: 'newsletter_signup' };
		let atAppend: unknown;
		installHeadProbe((node) => {
			atAppend = window.liQ;
			expect(node.src).toBe('https://b-code.liadm.com/inth-tag.min.js');
			expect(node.async).toBe(true);
			expect(node.getAttribute('charset')).toBe('utf-8');
		});
		loadScripts(
			[liveIntentTag({ events: [conversion, second], tagId: 'inth-tag' })],
			grantedMarketingConsents
		);
		expect(Array.isArray(atAppend)).toBe(true);
		expect(atAppend).toEqual([conversion, second]);
		expect(window.LI).toBeUndefined();
	});

	it('preserves existing queued events and appends configured events once', () => {
		const prior = { event: 'conversion', name: 'prior_event' };
		const queue: LiveIntentEvent[] = [prior];
		window.liQ = queue;
		const scripts = [
			liveIntentTag({ events: [conversion], tagId: 'inth-tag' }),
		];
		loadScripts(scripts, ALL_DENIED);
		expect(queue).toEqual([prior]);
		updateScripts(scripts, grantedMarketingConsents);
		expect(window.liQ).toBe(queue);
		expect(queue).toEqual([prior, conversion]);
		updateScripts(scripts, ALL_DENIED);
		updateScripts(scripts, grantedMarketingConsents);
		expect(window.liQ).toBe(queue);
		expect(queue).toEqual([prior, conversion]);
	});

	it('forwards initial events to an existing SDK object with its method receiver', () => {
		const push = vi.fn();
		const runtime = { push };
		window.liQ = runtime;
		const scripts = [
			liveIntentTag({ events: [conversion], tagId: 'inth-tag' }),
		];
		loadScripts(scripts, ALL_DENIED);
		expect(push).not.toHaveBeenCalled();
		updateScripts(scripts, grantedMarketingConsents);
		expect(window.liQ).toBe(runtime);
		expect(push).toHaveBeenCalledExactlyOnceWith(conversion);
		expect(push.mock.contexts).toEqual([runtime]);
		updateScripts(scripts, ALL_DENIED);
		updateScripts(scripts, grantedMarketingConsents);
		expect(push).toHaveBeenCalledExactlyOnceWith(conversion);
	});

	it.each(['before revoke', 'after revoke'])(
		'does not repeat initial events on regrant when load completes %s',
		(completion) => {
			const append = vi.fn();
			installHeadProbe(append);
			const options = { events: [conversion], tagId: 'inth-tag' };
			const scripts = [liveIntentTag(options)];
			loadScripts(scripts, grantedMarketingConsents);
			const element = document.querySelector('script');
			expect(element).not.toBeNull();
			const queue = window.liQ;
			if (completion === 'before revoke') {
				element?.dispatchEvent(new Event('load'));
			}
			updateScripts(scripts, ALL_DENIED);
			expect(element?.isConnected).toBe(true);
			expect(window.liQ).toBe(queue);
			expect(queue).toEqual([conversion]);
			if (completion === 'after revoke') {
				element?.dispatchEvent(new Event('load'));
			}
			const recreated = [liveIntentTag(options)];
			updateScripts(recreated, grantedMarketingConsents);
			loadScripts(recreated, grantedMarketingConsents);
			expect(document.querySelector('script')).toBe(element);
			expect(append).toHaveBeenCalledOnce();
			expect(window.liQ).toBe(queue);
			expect(queue).toEqual([conversion]);
		}
	);

	it('keeps vendor replacement globals and sends no invented withdrawal event', () => {
		const options = { events: [conversion], tagId: 'inth-tag' };
		const scripts = [liveIntentTag(options)];
		loadScripts(scripts, grantedMarketingConsents);
		const element = document.querySelector('script');
		const runtime = { push: vi.fn() };
		const config = { appId: 'inth-tag' };
		window.liQ = runtime;
		window.LI = config;
		const hub: unknown[] = [];
		const runtimeWindow: Window & { liQHub?: unknown[] } = window;
		runtimeWindow.liQHub = hub;
		updateScripts(scripts, ALL_DENIED);
		element?.dispatchEvent(new Event('load'));
		updateScripts([liveIntentTag(options)], grantedMarketingConsents);
		expect(window.liQ).toBe(runtime);
		expect(window.LI).toBe(config);
		expect(runtimeWindow.liQHub).toBe(hub);
		expect(runtime.push).not.toHaveBeenCalled();
		expect(document.querySelector('script')).toBe(element);
	});
});

describe.each(npmAndRemote('liveIntentTag', liveIntentTag))(
	'LiveIntent dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();
		afterEach(() => {
			for (const key of ['lc2', 'liQHub', 'liQ_instances']) {
				Reflect.deleteProperty(window, key);
			}
		});

		it('waits for marketing consent, then creates an empty event array before the account script', async () => {
			const sources: string[] = [];
			let atAppend: unknown;
			installHeadProbe((node) => {
				atAppend = window.liQ;
				sources.push(node.src);
			});
			const scripts = [build({ tagId: 'inth-tag' })];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			updateScripts(scripts, grantedMeasurementConsents);
			for (const key of vendorGlobals) {
				expect(key in window).toBe(false);
			}
			expect(sources).toEqual([]);

			updateScripts(scripts, grantedMarketingConsents);
			expect(sources).toEqual(['https://b-code.liadm.com/inth-tag.min.js']);
			expect(atAppend).toEqual([]);
			expect(window.LI).toBeUndefined();
		});

		it('keeps vendor replacement globals and sends no invented withdrawal event', async () => {
			const scripts = [build({ tagId: 'inth-tag' })];
			loadScripts(scripts, grantedMarketingConsents);
			await settleScripts();
			const element = document.querySelector('script');
			expect(element).not.toBeNull();
			const runtime = { push: vi.fn() };
			const config = { appId: 'inth-tag' };
			window.liQ = runtime;
			window.LI = config;
			updateScripts(scripts, ALL_DENIED);
			element?.dispatchEvent(new Event('load'));
			updateScripts([build({ tagId: 'inth-tag' })], grantedMarketingConsents);
			expect(window.liQ).toBe(runtime);
			expect(window.LI).toBe(config);
			expect(runtime.push).not.toHaveBeenCalled();
			expect(document.querySelector('script')).toBe(element);
		});
	}
);
