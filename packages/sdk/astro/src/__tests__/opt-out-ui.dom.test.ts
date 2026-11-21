import type {
	OptOutPayload,
	OptOutTransportResult,
	RevocationReloadOptions,
} from '@inth/sdk/engine';
import { watchRevocationReload } from '@inth/sdk/engine';
import { onDemandRuntimeModules } from '@inth/sdk/runtime/on-demand';
import { V1_UUID_PATTERN } from '@inth/sdk/schema/types';
import { closeOptOutConfirmation } from '@inth/sdk/surface-actions';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { promptClassNames } from '../banner/class-names';
import { buildPrompt } from '../browser/render-prompt';
import { boot, registerRuntimeModules, registerTransport } from '../client';
import type { AstroConsentClient } from '../client';
import * as reactPanelSurface from '../components/islands/panel-surface';
import { resolveOptions } from '../integration';
import { testing as testingMode } from '../testing';
import { lazyTransport, testingTransport } from '../transport';
import type { InthAstroOptions } from '../types';
import { registerDialogAdapter, registerDialogSurface } from '../ui/adapter';
import { reactDialogAdapter } from '../ui/react';
import { testResolution, testRule } from './policy-fixture';
import { ISLAND_RENDER_TIMEOUT } from './react-dialog-island';

const reload = vi.fn();

registerRuntimeModules({
	...onDemandRuntimeModules,
	watchRevocationReload: (options: RevocationReloadOptions) =>
		watchRevocationReload({ ...options, reload }),
});

const OPT_OUT_RULE = {
	...testRule,
	id: 'astro_us_ca',
	model: 'opt-out' as const,
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice' as const,
	rights: ['disclosure', 'preferences', 'opt-out'] as const,
};

const CHOICE_OPT_OUT_RULE = {
	...OPT_OUT_RULE,
	id: 'astro_us_ca_choice',
	prompt: 'choice' as const,
};

type TestRule =
	| typeof OPT_OUT_RULE
	| typeof CHOICE_OPT_OUT_RULE
	| typeof testRule;

const cleanup: (() => void)[] = [];

const query = <TElement extends HTMLElement = HTMLElement>(
	testId: string
): TElement | null =>
	document.querySelector<TElement>(`[data-testid="${testId}"]`);

const waitForTestId = async <TElement extends HTMLElement = HTMLElement>(
	testId: string
): Promise<TElement> => {
	await vi.waitFor(
		() => expect(query<TElement>(testId)).not.toBeNull(),
		ISLAND_RENDER_TIMEOUT
	);
	return query<TElement>(testId) as TElement;
};

const waitForAbsent = async (testId: string): Promise<void> => {
	await vi.waitFor(
		() => expect(query(testId)).toBeNull(),
		ISLAND_RENDER_TIMEOUT
	);
};

const restoreDefaultTransport = (): void => {
	registerTransport((options) =>
		options.mode.type === 'testing'
			? testingTransport(options)
			: lazyTransport(options)
	);
};

beforeAll(() => {
	window.matchMedia ??= (queryText: string) =>
		({
			addEventListener: () => undefined,
			addListener: () => undefined,
			dispatchEvent: () => false,
			matches: false,
			media: queryText,
			onchange: null,
			removeEventListener: () => undefined,
			removeListener: () => undefined,
		}) as MediaQueryList;
});

afterEach(() => {
	for (const step of cleanup.splice(0).reverse()) {
		step();
	}
	restoreDefaultTransport();
	(window as unknown as Record<string, unknown>).__inthAstroConfig = undefined;
	reload.mockClear();
	localStorage.clear();
	sessionStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
		}
	}
});

interface MountConfig {
	initialPrivacySignals?: { gpc?: boolean };
	initialRecords?: Record<string, unknown>;
	options?: Partial<InthAstroOptions>;
	renderBanner?: boolean;
	rule?: TestRule;
}

const mountAstro = (params: MountConfig = {}): AstroConsentClient => {
	const rule = params.rule ?? OPT_OUT_RULE;
	registerDialogAdapter('react', () => Promise.resolve(reactDialogAdapter));
	registerDialogSurface('react', () => Promise.resolve(reactPanelSurface));

	const config: Record<string, unknown> = {
		initialPolicyResolution: testResolution(rule),
		initialRecords: params.initialRecords ?? {},
		initialTranslations: { language: 'en', translations: {} },
		now: Date.now(),
	};
	if (params.initialPrivacySignals) {
		config.initialPrivacySignals = params.initialPrivacySignals;
	}
	(window as unknown as Record<string, unknown>).__inthAstroConfig = config;

	const resolved = resolveOptions({
		consentCategories: ['necessary', 'measurement', 'marketing'],
		disableAnimation: true,
		mode: testingMode({ policy: [rule] }),
		reloadOnConsentRevoked: false,
		ui: 'react',
		...params.options,
	});
	const client = boot(resolved);

	if (params.renderBanner !== false) {
		const nodes = buildPrompt(
			client.getConsent(),
			{ classNames: promptClassNames, props: { disableAnimation: true } },
			resolved
		);
		for (const node of nodes) {
			node.hidden = false;
			document.body.append(node);
			cleanup.push(() => node.remove());
		}
	}

	cleanup.push(() => {
		client.dispose();
		document.getElementById('inth-dialog-host')?.remove();
	});
	return client;
};

const deviceOptOutRecord = (now = Date.now()) => ({
	heldBy: 'device' as const,
	method: 'button' as const,
	recordedAt: now - 1000,
	rights: ['sale', 'share'] as const,
});

const appendFooterOptOutLink = (): HTMLButtonElement => {
	const link = document.createElement('button');
	link.type = 'button';
	link.setAttribute('data-inth-action', 'opt-out');
	link.setAttribute('data-right', 'opt-out');
	link.textContent = 'Do Not Sell or Share My Personal Information';
	document.body.append(link);
	cleanup.push(() => link.remove());
	return link;
};

describe('opt-out confirmation receipt in Astro', () => {
	it('records the opt-out in one click, shows time and reference, and updates to account coverage without changing the reference', async () => {
		let resolveAnswer: ((result: OptOutTransportResult) => void) | undefined;
		let sentPayload: OptOutPayload | undefined;
		registerTransport(() =>
			Object.assign(
				() => ({
					optOut: (payload: OptOutPayload) => {
						sentPayload = payload;
						// oxlint-disable-next-line promise/avoid-new -- Resolves when the test answers the backend call.
						return new Promise<OptOutTransportResult>((resolve) => {
							resolveAnswer = resolve;
						});
					},
				}),
				{ kind: 'offline' as const }
			)
		);

		mountAstro();

		const link = query<HTMLButtonElement>('consent-banner-right-link-opt-out');
		expect(link).not.toBeNull();
		link?.click();

		await waitForTestId('opt-out-confirmation-root');
		const beforeDescription = query(
			'opt-out-confirmation-description'
		)?.textContent;
		const beforeReference = query(
			'opt-out-confirmation-reference'
		)?.textContent;
		const recordedAt = query<HTMLTimeElement>(
			'opt-out-confirmation-recorded-at'
		);

		expect(beforeDescription).toBeTruthy();
		expect(beforeDescription?.toLowerCase()).not.toContain('account');
		expect(recordedAt?.getAttribute('datetime')).toBeTruthy();
		expect(recordedAt?.textContent?.trim()).not.toBe('');
		expect(beforeReference).toMatch(V1_UUID_PATTERN);

		await vi.waitFor(() => expect(resolveAnswer).toBeDefined());
		resolveAnswer?.({
			ok: true,
			optOut: {
				heldBy: 'both',
				method: 'button',
				recordedAt: sentPayload?.givenAt ?? Date.now(),
				rights: ['sale', 'share'],
			},
			subjectId: sentPayload?.subjectId,
		});

		await vi.waitFor(() =>
			expect(
				query('opt-out-confirmation-description')?.textContent?.toLowerCase()
			).toContain('account')
		);
		expect(query('opt-out-confirmation-reference')?.textContent).toBe(
			beforeReference
		);
		expect(sentPayload?.idempotencyKey).toBe(beforeReference);
	});

	it('shows no reference for an account-held record this browser did not create', async () => {
		mountAstro({
			initialRecords: {
				optOut: {
					heldBy: 'person',
					method: 'propagated',
					recordedAt: Date.now() - 60_000,
					rights: ['sale', 'share'],
				},
				optOutRightsConfirmed: true,
			},
			renderBanner: false,
		});

		const link = appendFooterOptOutLink();
		link.click();

		await waitForTestId('opt-out-confirmation-root');
		expect(
			query('opt-out-confirmation-description')?.textContent?.toLowerCase()
		).toContain('account');
		expect(query('opt-out-confirmation-recorded-at')).not.toBeNull();
		expect(query('opt-out-confirmation-reference')).toBeNull();
	});
});

describe('sale-and-sharing block in the Astro preference dialog', () => {
	it('renders before the category list outside accordion items, opts out in one click, and shows status, time, and reference on reopen', async () => {
		const client = mountAstro({
			options: { presentation: { optOutLink: 'privacy-choices' } },
			renderBanner: false,
		});

		await client.openDialog('preferences');
		const block = await waitForTestId('consent-widget-opt-out');
		const accordion = await waitForTestId('consent-widget-accordion');

		expect([
			...document.querySelectorAll(
				'[data-testid="consent-widget-opt-out"], [data-testid="consent-widget-accordion"]'
			),
		]).toEqual([block, accordion]);
		expect(
			block.closest('[data-testid^="consent-widget-accordion-item-"]')
		).toBeNull();

		const optOutButton = await waitForTestId<HTMLButtonElement>(
			'consent-widget-opt-out-button'
		);
		optOutButton.click();

		await vi.waitFor(() => expect(client.getConsent().optOut).not.toBeNull());
		expect(client.getConsent().effectivePermissions.marketing).toBe(false);
		expect(client.getConsent().activeUI).not.toBe('dialog');

		if (client.runtime) {
			closeOptOutConfirmation(client.runtime.kernel);
		}
		await client.openDialog('preferences');
		const status = await waitForTestId('consent-widget-opt-out-status');
		expect(status.getAttribute('role')).toBe('status');

		const reopened = await waitForTestId('consent-widget-opt-out');
		const timeEl = reopened.querySelector('time');
		expect(timeEl?.getAttribute('datetime')).toBeTruthy();
		expect(timeEl?.textContent?.trim()).not.toBe('');
		const refEl = reopened.querySelector('code');
		expect(refEl?.textContent?.trim()).toMatch(V1_UUID_PATTERN);
		expect(
			reopened.querySelector('[data-testid="consent-widget-opt-out-button"]')
		).toBeNull();
	});

	it('omits the block under an opt-in policy', async () => {
		const client = mountAstro({
			renderBanner: false,
			rule: testRule,
		});

		await client.openDialog('preferences');
		await waitForTestId('consent-widget-accordion');
		expect(query('consent-widget-opt-out')).toBeNull();
		expect(query('consent-widget-opt-out-status')).toBeNull();
	});
});

describe('two-step opt-in confirmation in Astro', () => {
	it('lifts the opt-out in two steps from the Opt back in link and leaves it held on Cancel or Escape', async () => {
		const client = mountAstro({
			initialRecords: { optOut: deviceOptOutRecord() },
			renderBanner: false,
		});

		await client.openDialog('preferences');
		const link = await waitForTestId<HTMLButtonElement>(
			'consent-widget-opt-in-link'
		);
		link.click();

		const modal = await waitForTestId('opt-in-confirmation-root');
		expect(modal.getAttribute('role')).toBe('dialog');
		expect(modal.getAttribute('aria-modal')).toBe('true');
		expect(client.getConsent().optOut).not.toBeNull();

		const cancelButton = await waitForTestId<HTMLButtonElement>(
			'opt-in-confirmation-cancel-button'
		);
		await vi.waitFor(() => expect(document.activeElement).toBe(cancelButton));
		cancelButton.click();
		await waitForAbsent('opt-in-confirmation-root');
		expect(client.getConsent().optOut).not.toBeNull();
		expect(client.getConsent().activeUI).toBe('dialog');

		query<HTMLButtonElement>('consent-widget-opt-in-link')?.click();
		await waitForTestId('opt-in-confirmation-root');
		document.documentElement.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await waitForAbsent('opt-in-confirmation-root');
		expect(client.getConsent().optOut).not.toBeNull();
		expect(client.getConsent().activeUI).toBe('dialog');

		query<HTMLButtonElement>('consent-widget-opt-in-link')?.click();
		const confirmButton = await waitForTestId<HTMLButtonElement>(
			'opt-in-confirmation-confirm-button'
		);
		confirmButton.click();

		await vi.waitFor(() => expect(client.getConsent().optOut).toBeNull());
		expect(client.getConsent().effectivePermissions.marketing).toBe(true);
		await waitForAbsent('opt-in-confirmation-root');
	});

	it('mounts the dialog island and opens confirmation when Accept All is clicked on the banner while opted out', async () => {
		const client = mountAstro({
			initialRecords: { optOut: deviceOptOutRecord() },
			renderBanner: true,
			rule: CHOICE_OPT_OUT_RULE,
		});

		const acceptButton = query<HTMLButtonElement>(
			'consent-banner-accept-button'
		);
		expect(acceptButton).not.toBeNull();
		acceptButton?.click();

		await waitForTestId('opt-in-confirmation-root');
		expect(client.getConsent().optOut).not.toBeNull();
		expect(client.getConsent().explicitChoice).toBeNull();

		const confirmButton = await waitForTestId<HTMLButtonElement>(
			'opt-in-confirmation-confirm-button'
		);
		confirmButton.click();

		await vi.waitFor(() => expect(client.getConsent().optOut).toBeNull());
		expect(client.getConsent().effectivePermissions.marketing).toBe(true);
		await waitForAbsent('opt-in-confirmation-root');
	});

	it('opens confirmation from Accept All in the dialog and from Marketing-on then Save', async () => {
		const client = mountAstro({
			initialRecords: { optOut: deviceOptOutRecord() },
			renderBanner: false,
		});

		await client.openDialog('preferences');
		const acceptAll = await waitForTestId<HTMLButtonElement>(
			'consent-widget-footer-accept-all-button'
		);
		acceptAll.click();

		await waitForTestId('opt-in-confirmation-root');
		expect(client.getConsent().optOut).not.toBeNull();
		expect(client.getConsent().explicitChoice).toBeNull();

		query<HTMLButtonElement>('opt-in-confirmation-cancel-button')?.click();
		await waitForAbsent('opt-in-confirmation-root');

		const marketing = await waitForTestId<HTMLButtonElement>(
			'consent-widget-switch-marketing'
		);
		marketing.click();
		const save = await waitForTestId<HTMLButtonElement>(
			'consent-widget-footer-save-button'
		);
		save.click();

		await waitForTestId('opt-in-confirmation-root');
		expect(client.getConsent().optOut).not.toBeNull();
		expect(client.getConsent().explicitChoice).toBeNull();

		query<HTMLButtonElement>('opt-in-confirmation-confirm-button')?.click();
		await vi.waitFor(() => expect(client.getConsent().optOut).toBeNull());
		expect(client.getConsent().effectivePermissions.marketing).toBe(true);
	});

	it('remounts opt-in confirmation across ClientRouter swap and closes it via client.closeDialog', async () => {
		const client = mountAstro({
			initialRecords: { optOut: deviceOptOutRecord() },
			renderBanner: false,
			rule: CHOICE_OPT_OUT_RULE,
		});

		await client.acceptAll();
		await waitForTestId('opt-in-confirmation-root');

		document.getElementById('inth-dialog-host')?.remove();
		document.dispatchEvent(new Event('astro:after-swap'));
		await waitForTestId('opt-in-confirmation-root');

		client.closeDialog();
		await waitForAbsent('opt-in-confirmation-root');
		expect(client.getConsent().optOut).not.toBeNull();
	});

	it('hides the opt back in link while Global Privacy Control is active', async () => {
		const client = mountAstro({
			initialPrivacySignals: { gpc: true },
			initialRecords: {
				optOut: {
					heldBy: 'device',
					method: 'gpc',
					recordedAt: Date.now() - 1000,
					rights: ['sale', 'share'],
				},
			},
			renderBanner: false,
		});

		await client.openDialog('preferences');
		await waitForTestId('consent-widget-opt-out-status');
		expect(query('consent-widget-opt-in-link')).toBeNull();
	});

	it('lifts a held opt-out in one step on Accept All under an opt-in policy', async () => {
		const client = mountAstro({
			initialRecords: { optOut: deviceOptOutRecord() },
			renderBanner: false,
			rule: testRule,
		});

		await client.openDialog('preferences');
		const acceptAll = await waitForTestId<HTMLButtonElement>(
			'consent-widget-footer-accept-all-button'
		);
		acceptAll.click();

		await vi.waitFor(() => expect(client.getConsent().optOut).toBeNull());
		expect(query('opt-in-confirmation-root')).toBeNull();
		expect(client.getConsent().effectivePermissions.marketing).toBe(true);
	});
});
