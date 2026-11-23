import { policyRulePresets } from '@inth/sdk-core';
import type { Vendor } from '@inth/sdk-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { activateGatedScripts } from '../gated-scripts';
import {
	createTestingGlobal as createGlobal,
	createTestingConsentClient as createConsentClient,
} from '../testing-global';
import type { ConsentClient, ConsentUIHandle } from '../types';
import { mountConsentUI } from '../ui/mount';

const vendors: Vendor[] = [
	{
		category: 'measurement',
		description: 'Product analytics.',
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
	{
		category: 'marketing',
		id: 'x-pixel',
		name: 'X Pixel',
		privacyPolicyUrl: 'https://x.com/en/privacy',
	},
];

const clients: ConsentClient[] = [];

const clearCookies = function clearCookies(): void {
	for (const entry of document.cookie.split(';')) {
		const name = entry.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
};

const baseOptions = {
	consentCategories: ['measurement', 'marketing'],
	policy: [
		{
			...policyRulePresets.europeOptIn(),
			categories: ['measurement', 'marketing'],
			match: { isDefault: true },
			scopeMode: 'strict',
		},
	],
	vendors,
} satisfies Parameters<typeof createConsentClient>[0];

const start = async function start(
	options: Parameters<typeof createConsentClient>[0] = {}
): Promise<ConsentClient> {
	const client = createConsentClient(
		{
			...baseOptions,
			ui: { disableAnimation: true, styles: false },
			...options,
		},
		{ mountUI: mountConsentUI, pkg: '@inth/sdk/test' }
	);
	clients.push(client);
	client.start();
	await client.ready();
	return client;
};

const query = function query<ElementType extends HTMLElement = HTMLElement>(
	root: ParentNode,
	testId: string
): ElementType {
	const element = root.querySelector<ElementType>(`[data-testid="${testId}"]`);
	if (!element) {
		throw new Error(`missing ${testId}`);
	}
	return element;
};

/** Open the EU "Your Privacy Choices" dialog and wait for its categories. */
const openDialog = async function openDialog(
	client: ConsentClient,
	root: ParentNode
): Promise<void> {
	client.openDialog();
	await vi.waitFor(() => {
		expect(
			root.querySelector('[data-testid="consent-dialog-category-group"]')
		).not.toBeNull();
	});
};

/** Open a category's vendor table, an accordion on desktop. */
const openVendors = async function openVendors(
	root: ParentNode,
	category: string
): Promise<void> {
	const testId = `consent-dialog-vendor-trigger-${category}`;
	if (query(root, testId).getAttribute('aria-expanded') !== 'true') {
		query(root, testId).click();
	}
	await vi.waitFor(() =>
		expect(query(root, testId).getAttribute('aria-expanded')).toBe('true')
	);
};

const inertScript = function inertScript(
	category: string,
	vendor: string | null,
	body: string
): HTMLScriptElement {
	const script = document.createElement('script');
	script.type = 'text/plain';
	script.setAttribute('data-inth-category', category);
	if (vendor) {
		script.setAttribute('data-inth-vendor', vendor);
	}
	script.textContent = body;
	document.body.append(script);
	return script;
};

afterEach(() => {
	for (const client of clients.splice(0)) {
		client.dispose();
	}
	localStorage.clear();
	clearCookies();
	document.body.replaceChildren();
	document.head.querySelector('#inth-styles')?.remove();
	vi.restoreAllMocks();
});

describe('vendor switches in the preference centre', () => {
	it('lists each category vendor with a switch that is off until the category is on', async () => {
		const client = await start();
		const { root } = client.ui as ConsentUIHandle;
		await openDialog(client, root);

		const trigger = query(root, 'consent-dialog-vendor-trigger-measurement');
		expect(trigger.textContent).toMatch(/\b2\b/u);
		const table = query(root, 'consent-dialog-vendor-table-measurement');
		expect(table.getAttribute('role')).toBe('table');
		expect(table.textContent).toContain('PostHog');
		expect(table.textContent).toContain('YouTube');
		expect(
			root.querySelector(
				'[data-testid="consent-dialog-vendor-switch-measurement-x-pixel"]'
			)
		).toBeNull();
		query(root, 'consent-dialog-vendor-switch-marketing-x-pixel');

		const posthog = () =>
			query<HTMLButtonElement>(
				root,
				'consent-dialog-vendor-switch-measurement-posthog'
			);
		expect(posthog().getAttribute('role')).toBe('switch');
		const nameId = posthog().getAttribute('aria-labelledby');
		expect(nameId).toBeTruthy();
		expect(root.querySelector(`[id="${nameId ?? ''}"]`)?.textContent).toBe(
			'PostHog'
		);
		// Off while its category is off, and never disabled (CAT-03).
		expect(posthog().getAttribute('aria-checked')).toBe('false');
		expect(posthog().disabled).toBe(false);

		query(root, 'consent-dialog-category-switch-measurement').click();
		await vi.waitFor(() =>
			expect(posthog().getAttribute('aria-checked')).toBe('true')
		);
		// A draft is not a decision yet (EU-02).
		expect(client.getVendorChoice()).toBeNull();
	});

	it('records a vendor turned off on Save and keeps it off when the dialog reopens', async () => {
		const client = await start();
		const { root } = client.ui as ConsentUIHandle;
		await openDialog(client, root);
		query(root, 'consent-dialog-category-switch-measurement').click();
		await openVendors(root, 'measurement');
		query(root, 'consent-dialog-vendor-switch-measurement-posthog').click();
		await vi.waitFor(() =>
			expect(
				query(
					root,
					'consent-dialog-vendor-switch-measurement-posthog'
				).getAttribute('aria-checked')
			).toBe('false')
		);
		// A draft is not a decision yet.
		expect(client.getVendorChoice()).toBeNull();

		query(root, 'consent-dialog-save-button').click();
		await vi.waitFor(() => expect(client.getSnapshot().activeUI).toBe('none'));
		expect(client.has('measurement')).toBe(true);
		expect(client.getVendorChoice()?.denied).toEqual(['posthog']);
		expect(client.isVendorAllowed('posthog')).toBe(false);
		expect(client.isVendorAllowed('youtube')).toBe(true);
		expect(client.isVendorAllowed('x-pixel')).toBe(false);

		await openDialog(client, root);
		expect(
			query(root, 'consent-dialog-category-switch-measurement').getAttribute(
				'aria-checked'
			)
		).toBe('true');
		expect(
			query(
				root,
				'consent-dialog-vendor-switch-measurement-posthog'
			).getAttribute('aria-checked')
		).toBe('false');
		expect(
			query(
				root,
				'consent-dialog-vendor-switch-measurement-youtube'
			).getAttribute('aria-checked')
		).toBe('true');
	});

	it('drops an unsaved vendor toggle when the dialog closes', async () => {
		const client = await start();
		const { root } = client.ui as ConsentUIHandle;
		await openDialog(client, root);
		query(root, 'consent-dialog-category-switch-measurement').click();
		await openVendors(root, 'measurement');
		query(root, 'consent-dialog-vendor-switch-measurement-posthog').click();
		await vi.waitFor(() =>
			expect(
				query(
					root,
					'consent-dialog-vendor-switch-measurement-posthog'
				).getAttribute('aria-checked')
			).toBe('false')
		);
		client.closeDialog();
		await vi.waitFor(() =>
			expect(
				root.querySelector('[data-testid="consent-dialog-card"]')
			).toBeNull()
		);
		expect(client.getVendorChoice()).toBeNull();

		await openDialog(client, root);
		// The category edit went with it, and turning the category on again
		// shows every vendor on: the staged denial is gone.
		expect(
			query(root, 'consent-dialog-category-switch-measurement').getAttribute(
				'aria-checked'
			)
		).toBe('false');
		query(root, 'consent-dialog-category-switch-measurement').click();
		await vi.waitFor(() =>
			expect(
				query(
					root,
					'consent-dialog-vendor-switch-measurement-posthog'
				).getAttribute('aria-checked')
			).toBe('true')
		);
	});

	it('clears a vendor denial on Accept all and Reject all', async () => {
		const client = await start();
		const { root } = client.ui as ConsentUIHandle;
		await client.save({ measurement: true, vendors: { posthog: false } });
		expect(client.getVendorChoice()?.denied).toEqual(['posthog']);

		await openDialog(client, root);
		query(root, 'consent-dialog-accept-all').click();
		await vi.waitFor(() =>
			expect(client.getVendorChoice()?.denied).toEqual([])
		);
		expect(client.isVendorAllowed('posthog')).toBe(true);

		await client.save({ measurement: true, vendors: { posthog: false } });
		await openDialog(client, root);
		await openVendors(root, 'measurement');
		// A staged vendor switch does not survive a bulk action either.
		query(root, 'consent-dialog-vendor-switch-measurement-youtube').click();
		query(root, 'consent-dialog-reject-all').click();
		await vi.waitFor(() =>
			expect(client.getVendorChoice()?.denied).toEqual([])
		);
		await vi.waitFor(() => expect(client.getSnapshot().activeUI).toBe('none'));
		await openDialog(client, root);
		query(root, 'consent-dialog-category-switch-measurement').click();
		await vi.waitFor(() =>
			expect(
				query(
					root,
					'consent-dialog-vendor-switch-measurement-youtube'
				).getAttribute('aria-checked')
			).toBe('true')
		);
	});

	it('lists a disabled vendor without a switch', async () => {
		const client = await start({
			vendors: [{ ...vendors[0], disabled: true } as Vendor],
		});
		const { root } = client.ui as ConsentUIHandle;
		await openDialog(client, root);
		expect(
			query(root, 'consent-dialog-vendor-table-measurement').textContent
		).toContain('PostHog');
		expect(
			root.querySelector(
				'[data-testid="consent-dialog-vendor-switch-measurement-posthog"]'
			)
		).toBeNull();
	});

	it('expands a vendor table for its description and privacy policy', async () => {
		const client = await start();
		const { root } = client.ui as ConsentUIHandle;
		await openDialog(client, root);
		const trigger = query(root, 'consent-dialog-vendor-trigger-measurement');
		const panelId = trigger.getAttribute('aria-controls') ?? '';
		const panel = () => root.querySelector<HTMLElement>(`[id="${panelId}"]`);
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(panel()?.hasAttribute('inert')).toBe(true);
		trigger.click();
		await vi.waitFor(() =>
			expect(
				query(root, 'consent-dialog-vendor-trigger-measurement').getAttribute(
					'aria-expanded'
				)
			).toBe('true')
		);
		expect(panel()?.getAttribute('data-open')).toBe('true');
		expect(panel()?.hasAttribute('inert')).toBe(false);
		const table = query(root, 'consent-dialog-vendor-table-measurement');
		expect(panel()?.contains(table)).toBe(true);
		expect(table.textContent).toContain('Product analytics.');
		const link = table.querySelector('a[href="https://posthog.com/privacy"]');
		expect(link).not.toBeNull();
		expect(link?.getAttribute('aria-label')).toContain('PostHog');
	});

	it('renders no vendor list for a category without vendors', async () => {
		const client = await start({ vendors: [] });
		const { root } = client.ui as ConsentUIHandle;
		await openDialog(client, root);
		expect(
			root.querySelector('[data-testid^="consent-dialog-vendor-"]')
		).toBeNull();
	});

	it.each([
		{ initiallyDenied: false, label: 'adds a newly denied helper row' },
		{
			initiallyDenied: true,
			label: 'removes a helper row after its denial clears',
		},
	])('$label while the dialog stays open', async ({ initiallyDenied }) => {
		const client = await start({
			scripts: [
				{
					category: 'measurement',
					id: 'posthog',
					src: 'https://example.invalid/posthog.js',
					vendor: 'posthog',
					vendorDetails: {
						name: 'PostHog',
						privacyPolicyUrl: 'https://posthog.com/privacy',
					},
				},
			],
			vendors: [],
		});
		await client.kernel.commands.save(
			{ measurement: true },
			{ vendors: { posthog: !initiallyDenied } }
		);
		const { root } = client.ui as ConsentUIHandle;
		await openDialog(client, root);
		const selector =
			'[data-testid="consent-dialog-vendor-switch-measurement-posthog"]';
		expect(root.querySelector(selector) !== null).toBe(initiallyDenied);

		await client.kernel.commands.save(
			{ measurement: true },
			{ vendors: { posthog: initiallyDenied } }
		);
		expect(client.getSnapshot().activeUI).toBe('dialog');
		await vi.waitFor(() =>
			expect(root.querySelector(selector) !== null).toBe(!initiallyDenied)
		);
		expect(root.querySelector(selector)?.getAttribute('aria-checked')).toBe(
			initiallyDenied ? undefined : 'false'
		);
	});
});

describe('reading vendor consent', () => {
	it('exposes declared vendors and whether each may load', async () => {
		const client = createConsentClient({ ...baseOptions, ui: false });
		clients.push(client);
		client.start();
		await client.ready();
		expect(
			client
				.getDeclaredVendors()
				.map((vendor) => vendor.id)
				.toSorted()
		).toEqual(['posthog', 'x-pixel', 'youtube']);
		expect(client.isVendorAllowed('posthog')).toBe(false);
		// An undeclared vendor, such as a typo, never reads as allowed.
		expect(client.isVendorAllowed('unknown-vendor')).toBe(false);
		await client.acceptAll();
		expect(client.isVendorAllowed('posthog')).toBe(true);
		expect(client.isVendorAllowed('x-pixel')).toBe(true);
		expect(client.isVendorAllowed('unknown-vendor')).toBe(false);
	});

	it('emits consent when only a vendor changes', async () => {
		const client = createConsentClient({ ...baseOptions, ui: false });
		clients.push(client);
		client.start();
		await client.ready();
		await client.save({ measurement: true });
		const listener = vi.fn();
		client.on('consent', listener);
		await client.save({ measurement: true, vendors: { posthog: false } });
		expect(listener).toHaveBeenCalledOnce();
	});

	it('takes vendors from a queued config call and reads them through window.inth', async () => {
		const api = createGlobal({ pkg: '@inth/sdk/test' });
		api.config({ ...baseOptions, ui: false });
		const client = api.init();
		clients.push(client);
		await api.ready();
		expect(api.getDeclaredVendors().map((vendor) => vendor.id)).toContain(
			'posthog'
		);
		await api.save({ measurement: true, vendors: { posthog: false } });
		expect(api.getVendorChoice()?.denied).toEqual(['posthog']);
		expect(api.isVendorAllowed('posthog')).toBe(false);
		expect(api.isVendorAllowed('youtube')).toBe(true);
	});
});

describe('gated inline scripts with data-inth-vendor', () => {
	it('keeps a tag inert while its vendor is off, and runs the rest of the category', async () => {
		const posthog = inertScript('measurement', 'posthog', 'window.__ph = 1;');
		const youtube = inertScript('measurement', 'youtube', 'window.__yt = 1;');
		const client = createConsentClient({ ...baseOptions, ui: false });
		clients.push(client);
		client.start();
		await client.ready();
		await client.save({ measurement: true, vendors: { posthog: false } });

		expect(youtube.isConnected).toBe(false);
		expect(posthog.isConnected).toBe(true);
		expect(posthog.hasAttribute('data-inth-activated')).toBe(false);

		// Lifting the denial on its own, with no category change, runs it.
		await client.save({ measurement: true, vendors: { posthog: true } });
		expect(posthog.isConnected).toBe(false);
		const activated = document.querySelector(
			'script[data-inth-vendor="posthog"][data-inth-activated="true"]'
		);
		expect(activated).not.toBeNull();
	});

	it('gates a vendor-named tag in a standalone scan', async () => {
		const client = createConsentClient({ ...baseOptions, ui: false });
		clients.push(client);
		client.start();
		await client.ready();
		await client.save({ measurement: true, vendors: { posthog: false } });
		const root = document.createElement('div');
		document.body.append(root);
		const script = document.createElement('script');
		script.type = 'text/plain';
		script.setAttribute('data-inth-category', 'measurement');
		script.setAttribute('data-inth-vendor', 'posthog');
		root.append(script);
		expect(activateGatedScripts(client.getSnapshot(), root)).toBe(0);
		expect(script.isConnected).toBe(true);
	});

	it('declares the slug an inert tag names, so a stored denial holds before any declaration', async () => {
		inertScript('measurement', 'late-vendor', 'window.__late = 1;');
		const client = createConsentClient({ ...baseOptions, ui: false });
		clients.push(client);
		client.start();
		await client.ready();
		expect(
			client
				.getSnapshot()
				.vendors?.declared.some((vendor) => vendor.id === 'late-vendor')
		).toBe(true);
	});
});

describe('gated iframes with data-vendor', () => {
	it('keeps a frame paused while its vendor is off', async () => {
		const frame = document.createElement('iframe');
		frame.setAttribute('data-src', 'https://example.test/embed');
		frame.setAttribute('data-category', 'measurement');
		frame.setAttribute('data-vendor', 'posthog');
		document.body.append(frame);
		const client = createConsentClient({ ...baseOptions, ui: false });
		clients.push(client);
		client.start();
		await client.ready();
		await client.save({ measurement: true, vendors: { posthog: false } });
		await Promise.resolve();
		expect(frame.getAttribute('src')).toBeNull();
		await client.save({ measurement: true, vendors: { posthog: true } });
		await vi.waitFor(() =>
			expect(frame.getAttribute('src')).toBe('https://example.test/embed')
		);
	});
});
