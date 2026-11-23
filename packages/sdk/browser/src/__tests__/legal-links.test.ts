import { clearGVLCache } from '@inth/sdk-iab';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { completeGVL } from '../../../iab/src/__tests__/fixtures/gvl-sample';
import { readPageOptions } from '../auto-init';
import type { ConsentClient, ScriptTagClientOptions } from '../types';
import { init, initIAB } from './fixtures/factory-init';

const clients: ConsentClient[] = [];

const scriptWith = (attributes: Record<string, string>): HTMLScriptElement => {
	const script = document.createElement('script');
	for (const [name, value] of Object.entries(attributes)) {
		script.setAttribute(name, value);
	}
	return script;
};

const legalAttributes = {
	'data-cookie-policy-url': '/cookies',
	'data-privacy-policy-url': '/privacy',
	'data-terms-url': '/terms',
};
const legalURLs = ['/privacy', '/cookies', '/terms'];

afterEach(() => {
	for (const client of clients.splice(0)) {
		client.dispose();
	}
	clearGVLCache();
	localStorage.clear();
	for (const entry of document.cookie.split(';')) {
		document.cookie = `${entry.split('=')[0]?.trim()}=; Max-Age=0; path=/`;
	}
	document.body.replaceChildren();
});

const start = async (
	variant: 'ordinary' | 'IAB',
	attributes: Record<string, string> = legalAttributes,
	configs: ScriptTagClientOptions[] = []
): Promise<ConsentClient> => {
	const { options } = readPageOptions(scriptWith(attributes), configs);
	const clientOptions: ScriptTagClientOptions = {
		overrides: { country: 'DE' },
		...options,
		ui:
			options.ui === false
				? false
				: {
						disableAnimation: true,
						styles: false,
						...options.ui,
					},
	};
	const client =
		variant === 'IAB'
			? initIAB({ ...clientOptions, iab: { cmpId: 28, gvl: completeGVL } })
			: init(clientOptions);
	clients.push(client);
	await client.ready();
	await client.runtime.iab?.whenReady?.();
	return client;
};

const links = (client: ConsentClient): (string | null)[] =>
	Array.from(
		client.ui?.root.querySelectorAll('[data-testid*="-legal-link-"]') ?? []
	).map((link) => link.getAttribute('href'));

/** Waits for the prompt or the dialog, which load on demand, to render. */
const rendered = async (
	client: ConsentClient,
	testId: 'consent-banner-root' | 'consent-dialog-root'
): Promise<void> => {
	await vi.waitFor(() => {
		expect(
			client.ui?.root.querySelector(`[data-testid="${testId}"]`)
		).not.toBeNull();
	});
};

const openDialog = async (client: ConsentClient): Promise<void> => {
	client.openDialog();
	await rendered(client, 'consent-dialog-root');
};

describe('ordinary script-tag legal links', () => {
	it("[BNR-08] links every configured policy in the banner and the regime's one in the dialog", async () => {
		const client = await start('ordinary');
		await rendered(client, 'consent-banner-root');
		expect(links(client)).toEqual(legalURLs);

		await openDialog(client);
		expect(links(client)).toEqual(['/cookies']);
	});

	it('keeps links when branding is hidden through attributes and queued config', async () => {
		const client = await start(
			'ordinary',
			{ ...legalAttributes, 'data-hide-branding': '' },
			[{ ui: { banner: { hideBranding: true } } }]
		);
		await rendered(client, 'consent-banner-root');
		expect(links(client)).toEqual(legalURLs);
		expect(
			client.ui?.root.querySelector('[data-testid$="-branding"]')
		).toBeNull();
	});

	it('uses the queued link selection independently for each surface', async () => {
		const client = await start('ordinary', legalAttributes, [
			{
				ui: {
					banner: { legalLinks: ['cookiePolicy'] },
					dialog: { legalLinks: ['termsOfService', 'privacyPolicy'] },
				},
			},
		]);
		await rendered(client, 'consent-banner-root');
		expect(links(client)).toEqual(['/cookies']);

		// The EU dialog shows only the Cookie Policy, which this list leaves out.
		await openDialog(client);
		expect(links(client)).toEqual([]);
	});

	it.each([null, []])(
		'hides links when queued config selects %j',
		async (legalLinks) => {
			const client = await start('ordinary', legalAttributes, [
				{
					ui: { banner: { legalLinks }, dialog: { legalLinks } },
				},
			]);
			await rendered(client, 'consent-banner-root');
			expect(links(client)).toEqual([]);

			await openDialog(client);
			expect(links(client)).toEqual([]);
		}
	);

	it('opens links in a new tab with noopener noreferrer', async () => {
		const client = await start('ordinary');
		await rendered(client, 'consent-banner-root');
		const link = client.ui?.root.querySelector('[data-testid*="-legal-link-"]');
		expect(link?.getAttribute('target')).toBe('_blank');
		expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
	});

	it('does not mount UI when the tag has data-no-ui', async () => {
		const client = await start('ordinary', {
			...legalAttributes,
			'data-no-ui': '',
		});
		expect(client.ui).toBeNull();
		expect(document.querySelector('[data-inth-ui]')).toBeNull();
	});
});

describe('IAB script-tag legal links', () => {
	const variant = 'IAB';

	it('renders all URL attributes in the banner and dialog', async () => {
		const client = await start(variant);
		expect(links(client)).toEqual(legalURLs);

		client.openDialog();
		expect(links(client)).toEqual(legalURLs);
	});

	it('keeps links when branding is hidden through attributes and queued config', async () => {
		const client = await start(
			variant,
			{ ...legalAttributes, 'data-hide-branding': '' },
			[
				{
					ui: {
						banner: { hideBranding: true },
						dialog: { hideBranding: true },
					},
				},
			]
		);
		expect(links(client)).toEqual(legalURLs);
		expect(
			client.ui?.root.querySelector('[data-testid$="-branding"]')
		).toBeNull();

		client.openDialog();
		expect(links(client)).toEqual(legalURLs);
		expect(
			client.ui?.root.querySelector('[data-testid$="-branding"]')
		).toBeNull();
	});

	it('uses the queued link selection independently for each surface', async () => {
		const client = await start(variant, legalAttributes, [
			{
				ui: {
					banner: { legalLinks: ['cookiePolicy'] },
					dialog: { legalLinks: ['termsOfService', 'privacyPolicy'] },
				},
			},
		]);
		expect(links(client)).toEqual(['/cookies']);

		client.openDialog();
		expect(links(client)).toEqual(['/terms', '/privacy']);
	});

	it.each([null, []])(
		'hides links when queued config selects %j',
		async (legalLinks) => {
			const client = await start(variant, legalAttributes, [
				{
					ui: { banner: { legalLinks }, dialog: { legalLinks } },
				},
			]);
			expect(links(client)).toEqual([]);

			client.openDialog();
			expect(links(client)).toEqual([]);
		}
	);

	it('opens links in a new tab with noopener noreferrer', async () => {
		const client = await start(variant);
		const link = client.ui?.root.querySelector('[data-testid*="-legal-link-"]');
		expect(link?.getAttribute('target')).toBe('_blank');
		expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
	});

	it('separates the links from the copy and from each other', async () => {
		const client = await start(variant);
		const linkGroup = (): Element | null | undefined =>
			client.ui?.root.querySelector('[data-testid*="-legal-link-"]')
				?.parentElement?.parentElement;
		const expected = ' Privacy Policy, Cookie Policy, Terms of Service';

		expect(linkGroup()?.textContent).toBe(expected);
		client.openDialog();
		expect(linkGroup()?.textContent).toBe(expected);
	});

	it('does not mount UI when the tag has data-no-ui', async () => {
		const client = await start(variant, {
			...legalAttributes,
			'data-no-ui': '',
		});
		expect(client.ui).toBeNull();
		expect(document.querySelector('[data-inth-ui]')).toBeNull();
	});
});
