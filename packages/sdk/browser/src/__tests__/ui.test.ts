import { policyRulePresets } from '@inth/sdk-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { classes } from '../generated/styles';
import { createTestingConsentClient as createConsentClient } from '../testing-global';
import type {
	ConsentClient,
	ConsentUIHandle,
	ConsentUIOptions,
} from '../types';
import { mountConsentUI } from '../ui/mount';

const clients: ConsentClient[] = [];

const clearCookies = function clearCookies(): void {
	for (const entry of document.cookie.split(';')) {
		const name = entry.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
};

const mount = async function mount(
	ui: ConsentUIOptions = {},
	options: Parameters<typeof createConsentClient>[0] = {}
): Promise<{
	client: ConsentClient;
	handle: ConsentUIHandle;
	root: ParentNode;
}> {
	const client = createConsentClient(
		{
			consentCategories: ['measurement', 'marketing'],
			legalLinks: { privacyPolicy: { href: '/privacy' } },
			policy: [
				{
					...policyRulePresets.europeOptIn(),
					categories: ['measurement', 'marketing'],
					match: { isDefault: true },
					scopeMode: 'strict',
				},
			],
			// jsdom cannot parse the modern CSS in the sheet; one test opts in.
			ui: { disableAnimation: true, styles: false, ...ui },
			...options,
		},
		{ mountUI: mountConsentUI, pkg: '@inth/sdk/test' }
	);
	clients.push(client);
	client.start();
	await client.ready();
	const handle = client.ui as ConsentUIHandle;
	return { client, handle, root: handle.root };
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

afterEach(() => {
	for (const client of clients.splice(0)) {
		client.dispose();
	}
	localStorage.clear();
	sessionStorage.clear();
	clearCookies();
	document.body.replaceChildren();
	document.head.querySelector('#inth-styles')?.remove();
});

describe('mountConsentUI', () => {
	it('applies the assigned arm theme slots to the rendered parts', async () => {
		const experiment = {
			// `control` is the host presentation and is not listed in `arms`.
			arm: 'control',
			arms: {
				branded: {
					theme: { slots: { consentBannerCard: 'arm-card' } },
				},
			},
			id: 'card-class',
		};
		const { client, root } = await mount(
			{ theme: { slots: { consentBannerTitle: 'base-title' } } },
			{ experiment }
		);
		// Start on the control arm, so the lazily loaded controller cannot
		// assign `branded` before the first assertion.
		await vi.waitFor(() => {
			expect(client.getSnapshot().experiment?.arm).toBe('control');
			query(root, 'consent-banner-card');
		});
		expect(query(root, 'consent-banner-card').classList).not.toContain(
			'arm-card'
		);
		client.kernel.set.experiment({
			acknowledgedDiagnostics: false,
			arm: 'branded',
			assignedBy: 'inth',
			id: 'card-class',
		});
		expect(query(root, 'consent-banner-card').classList).toContain('arm-card');
		// The arm's slots merge over the host's, as the theme tokens do.
		expect(query(root, 'consent-banner-title').classList).toContain(
			'base-title'
		);
	});

	it('re-slots the trigger icon when the arm changes after mount', async () => {
		const experiment = {
			arm: 'control',
			arms: {
				branded: {
					theme: {
						slots: {
							consentDialogTrigger: { style: { opacity: 0.5 } },
							consentDialogTriggerIcon: 'branded-icon',
						},
					},
				},
				plain: {
					theme: {
						slots: {
							consentDialogTriggerIcon: { className: 'bare', noStyle: true },
						},
					},
				},
			},
			id: 'trigger-icon',
		};
		const { client, root } = await mount({ trigger: true }, { experiment });
		const trigger = query(root, 'consent-dialog-trigger');
		const icon = () =>
			trigger.querySelector('[part~="consentDialogTriggerIcon"]');
		expect(icon()?.classList).toContain(classes.trigger.icon);
		expect(icon()?.classList).not.toContain('branded-icon');

		const assign = (arm: string) =>
			client.kernel.set.experiment({
				acknowledgedDiagnostics: false,
				arm,
				assignedBy: 'inth',
				id: 'trigger-icon',
			});
		assign('branded');
		expect(icon()?.classList).toContain('branded-icon');
		expect(icon()?.classList).toContain(classes.trigger.icon);
		expect(trigger.style.opacity).toBe('0.5');

		// The next arm's `noStyle` drops the stock class, and the previous
		// arm's class and inline style go with it.
		assign('plain');
		expect(icon()?.className).toBe('bare');
		expect(trigger.style.opacity).toBe('');
		expect(trigger.classList).toContain(classes.trigger.trigger);
	});

	it('creates the stylesheet when an arm theme arrives after mount', async () => {
		const experiment = {
			arms: {
				bold: { theme: { colors: { primary: '#123456' } } },
			},
			id: 'button-style',
		};
		// No stylesheet, theme or css: nothing to inject at mount.
		const { client, root } = await mount({}, { experiment });
		client.kernel.set.experiment({
			acknowledgedDiagnostics: false,
			arm: 'bold',
			assignedBy: 'inth',
			id: 'button-style',
		});
		expect(root.querySelector('style')?.textContent).toContain('#123456');
	});

	it('replaces light DOM customization when remounted and removes it on disposal', async () => {
		const { client, handle } = await mount({
			css: 'button { color: red; }',
			shadow: false,
		});
		const next = client.mountUI({
			css: 'button { color: blue; }',
			shadow: false,
			styles: false,
		});
		expect(handle.host.isConnected).toBe(false);
		expect(next.host.querySelector('style')?.textContent).toBe(
			'button { color: blue; }'
		);
		client.dispose();
		expect(document.querySelector('[data-inth-ui] style')).toBeNull();
	});
	it('stamps the configured nonce on the injected style element', async () => {
		const { root } = await mount(
			{ css: '.probe { color: red; }' },
			{ nonce: 'page-nonce' }
		);

		const style = root.querySelector('style');
		expect(style?.nonce).toBe('page-nonce');
	});

	it('shows the trigger beside the banner, and hides it over the dialog', async () => {
		const { root, client } = await mount({ trigger: true });

		const trigger = query(root, 'consent-dialog-trigger');
		expect(client.getSnapshot().activeUI).toBe('banner');
		expect(trigger.hidden).toBe(false);

		trigger.click();
		expect(client.getSnapshot().activeUI).toBe('dialog');
		expect(trigger.hidden).toBe(true);
	});

	it('waits for the answer with after-consent', async () => {
		const { root, client } = await mount({
			trigger: { showWhen: 'after-consent' },
		});

		const trigger = query(root, 'consent-dialog-trigger');
		expect(trigger.hidden).toBe(true);

		await client.acceptAll();

		expect(trigger.hidden).toBe(false);
	});

	it('hides the trigger under a policy that leaves nothing to manage', async () => {
		const { root } = await mount({ trigger: true }, { policy: ['worldNone'] });

		expect(query(root, 'consent-dialog-trigger').hidden).toBe(true);
	});

	it('names the trigger from the trigger translations', async () => {
		const { root } = await mount(
			{ trigger: true },
			{
				i18n: {
					locale: 'en',
					messages: { en: { trigger: { label: 'Cookie settings' } } },
				},
			}
		);

		expect(
			query(root, 'consent-dialog-trigger').getAttribute('aria-label')
		).toBe('Cookie settings');
	});

	it('applies an explicit dark scheme to the wrapper', async () => {
		const { root, handle } = await mount({ colorScheme: 'dark' });

		expect(
			root.querySelector('.inth-host')?.classList.contains('inth-dark')
		).toBe(true);
		expect(handle.host.style.colorScheme).toBe('dark');
	});

	it('follows the document with a null scheme', async () => {
		// The system is dark; null must not follow it.
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({
				addEventListener: () => undefined,
				matches: true,
				removeEventListener: () => undefined,
			}))
		);
		const html = document.documentElement;
		try {
			const { root, handle } = await mount({ colorScheme: null });
			const dark = () =>
				root.querySelector('.inth-host')?.classList.contains('inth-dark') &&
				handle.host.classList.contains('inth-dark');
			expect(dark()).toBe(false);

			// The site's own class, either spelling, reaches the shadow root.
			html.classList.add('dark');
			await vi.waitFor(() => expect(dark()).toBe(true));
			html.classList.replace('dark', 'inth-dark');
			await Promise.resolve();
			expect(dark()).toBe(true);
			html.classList.remove('inth-dark');
			await vi.waitFor(() => expect(dark()).toBe(false));
			expect(html.classList.length).toBe(0);
		} finally {
			vi.unstubAllGlobals();
			html.className = '';
		}
	});

	it('tears everything down on destroy', async () => {
		const { handle } = await mount();

		handle.destroy();

		expect(document.querySelector('[data-inth-ui]')).toBeNull();
	});

	describe('theme.slots', () => {
		it('keeps the trigger slot classes through position and visibility changes', async () => {
			const { root, client } = await mount({
				theme: {
					slots: {
						consentDialogTrigger: {
							className: 'brand-trigger',
							style: { '--brand-ring': '#0a66ff' },
						},
						consentDialogTriggerIcon: 'brand-trigger-icon',
					},
				},
				trigger: true,
			});

			const trigger = query(root, 'consent-dialog-trigger');
			expect(trigger.getAttribute('part')).toBe('consentDialogTrigger');
			expect(trigger.classList).toContain('brand-trigger');
			expect(trigger.classList).toContain(classes.trigger.trigger);
			expect(trigger.style.getPropertyValue('--brand-ring')).toBe('#0a66ff');
			const icon = trigger.querySelector('span');
			expect(icon?.classList).toContain('brand-trigger-icon');
			expect(icon?.getAttribute('part')).toBe('consentDialogTriggerIcon');

			// Showing the trigger rewrites its state classes.
			await client.acceptAll();
			expect(trigger.hidden).toBe(false);
			expect(trigger.classList).toContain('brand-trigger');
			expect(trigger.getAttribute('part')).toBe('consentDialogTrigger');
		});

		it('links stylesheetUrls inside the UI root with the configured nonce', async () => {
			const { root } = await mount(
				{ stylesheetUrls: ['/brand.css', 'https://cdn.example/brand.css'] },
				{ nonce: 'page-nonce' }
			);

			const links = [
				...root.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
			];
			expect(links.map((link) => link.getAttribute('href'))).toEqual([
				'/brand.css',
				'https://cdn.example/brand.css',
			]);
			expect(links.map((link) => link.nonce)).toEqual([
				'page-nonce',
				'page-nonce',
			]);
		});
	});

	describe('opt-out page action', () => {
		it('falls back to opening the preference centre under a non-opt-out rule', async () => {
			const link = document.createElement('button');
			link.type = 'button';
			link.setAttribute('data-inth-action', 'opt-out');
			document.body.append(link);

			const { client, root } = await mount();
			link.click();

			await vi.waitFor(() => {
				expect(query(root, 'consent-dialog-root')).not.toBeNull();
			});
			expect(
				root.querySelector('[data-testid="opt-out-confirmation-root"]')
			).toBeNull();
			expect(client.getSnapshot().optOut).toBeNull();
			expect(client.getSnapshot().activeUI).toBe('dialog');
		});
	});
});
