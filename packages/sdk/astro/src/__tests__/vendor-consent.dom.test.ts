/**
 * Vendor-level consent through the Astro integration: the `vendors` option
 * reaches the page runtime, the page client reads vendor consent, and
 * inert tags wait on their vendor. The dialog's vendor rows are React's
 * own, tested with its dialog.
 */

import type { Vendor } from '@inth/sdk/engine';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import type { AstroEngineClient } from '../astro-consent-client.model';
import { activateGatedScripts } from '../browser/activate-gated-scripts';
import { boot } from '../client';
import { resolveOptions } from '../integration';
import type { InthAstroOptions } from '../inth-options.model';
import { testing as testingMode } from '../testing';
import { testResolution, testRule } from './policy-fixture';

const VENDORS: Vendor[] = [
	{
		category: 'measurement',
		id: 'posthog',
		name: 'PostHog',
		privacyPolicyUrl: 'https://posthog.com/privacy',
	},
	{
		category: 'measurement',
		id: 'youtube',
		name: 'YouTube',
		privacyPolicyUrl: 'https://policies.google.com/privacy',
	},
];

const OPTIONS: InthAstroOptions = {
	consentCategories: ['necessary', 'measurement'],
	mode: testingMode({ policy: [testRule] }),
	reloadOnConsentRevoked: false,
	vendors: VENDORS,
};

const cleanup: (() => Promise<void> | void)[] = [];

// jsdom has no `matchMedia`; the React surface reads reduced motion from it.
beforeAll(() => {
	window.matchMedia ??= (query: string) =>
		({
			addEventListener: () => undefined,
			addListener: () => undefined,
			dispatchEvent: () => false,
			matches: false,
			media: query,
			onchange: null,
			removeEventListener: () => undefined,
			removeListener: () => undefined,
		}) as MediaQueryList;
});

afterEach(async () => {
	for (const step of cleanup.splice(0).reverse()) {
		// oxlint-disable-next-line no-await-in-loop -- Tear down in reverse mount order.
		await step();
	}
	(window as unknown as Record<string, unknown>).__inthAstroConfig = undefined;
	document.body.innerHTML = '';
	localStorage.clear();
	for (const entry of document.cookie.split(';')) {
		const name = entry.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
});

const start = function start(
	options: InthAstroOptions = OPTIONS,
	{ resolved = true } = {}
): AstroEngineClient {
	if (resolved) {
		// The server resolved the policy, as it does for a rendered page.
		(window as unknown as Record<string, unknown>).__inthAstroConfig = {
			initialPolicyResolution: testResolution(),
		};
	}
	const client = boot(resolveOptions(options));
	cleanup.push(() => {
		client.dispose();
		document.getElementById('inth-dialog-host')?.remove();
	});
	return client;
};

describe('the vendors option', () => {
	it('survives the serialized options the browser boots from', () => {
		const resolved = resolveOptions(OPTIONS);
		expect(JSON.parse(JSON.stringify(resolved)).vendors).toEqual(VENDORS);
	});

	it('declares the vendors on the page runtime', () => {
		const client = start();
		expect(
			client.runtime.kernel
				.getSnapshot()
				.vendors?.declared.map((vendor) => vendor.id)
				.toSorted()
		).toEqual(['posthog', 'youtube']);
	});
});

describe('reading vendor consent from the page client', () => {
	it('reports declared vendors, the recorded choice and each vendor gate', async () => {
		const client = start();
		expect(
			client
				.getDeclaredVendors()
				.map((vendor) => vendor.id)
				.toSorted()
		).toEqual(['posthog', 'youtube']);
		expect(client.getVendorChoice()).toBeNull();
		expect(client.isVendorAllowed('posthog')).toBe(false);

		await client.save({ measurement: true, vendors: { posthog: false } });

		expect(client.getVendorChoice()?.denied).toEqual(['posthog']);
		expect(client.isVendorAllowed('posthog')).toBe(false);
		expect(client.isVendorAllowed('youtube')).toBe(true);
		// An undeclared vendor, such as a typo, never reads as allowed.
		expect(client.isVendorAllowed('unknown-vendor')).toBe(false);

		await client.acceptAll();
		expect(client.getVendorChoice()?.denied).toEqual([]);
		expect(client.isVendorAllowed('posthog')).toBe(true);
	});
});

describe('inert tags with data-inth-vendor', () => {
	it('waits on the vendor as well as the category', async () => {
		const client = start();
		await client.save({ measurement: true, vendors: { posthog: false } });
		document.body.innerHTML = [
			'<script type="text/plain" data-inth-category="measurement" data-inth-vendor="posthog">1</script>',
			'<script type="text/plain" data-inth-category="measurement" data-inth-vendor="youtube">2</script>',
		].join('');

		expect(activateGatedScripts(client.getConsent())).toBe(1);
		const posthog = document.querySelector(
			'script[data-inth-vendor="posthog"]'
		);
		expect(posthog?.getAttribute('type')).toBe('text/plain');
		expect(posthog?.hasAttribute('data-inth-activated')).toBe(false);

		await client.save({ measurement: true, vendors: { posthog: true } });
		await vi.waitFor(() =>
			expect(
				document
					.querySelector('script[data-inth-vendor="posthog"]')
					?.getAttribute('data-inth-activated')
			).toBe('true')
		);
	});
});
