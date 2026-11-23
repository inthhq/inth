import { MINIMAL_GVL } from '@inth/conformance/fixtures/gvl';
import { createConsentKernel } from '@inth/sdk/engine';
import { createPersistence } from '@inth/sdk/modules/persistence';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { iabPromptClassNames } from '../banner/banner-class-names.model';
import {
	IAB_PROMPT_SLOT_ATTRIBUTE,
	PROMPT_SLOT_ATTRIBUTE,
} from '../banner/prompt-slot.model';
import { boot, registerIAB } from '../client';
import type { AstroConsentClient } from '../client';
import { resolveOptions } from '../integration';
import type { InthAstroOptions } from '../inth-options.model';
import { promptClassNames } from '../prompt/prompt-class-names';
import { resolvePromptModel } from '../prompt/prompt.model';
import { renderPromptHTML } from '../prompt/render-prompt-html';
import { resolveConsentContext } from '../server';
import { testing as testingMode } from '../testing';
import { createTestPageIAB } from './page-iab';
import { testResolution, testRule } from './policy-fixture';
// The client imports the prompt, the IAB renderer, and @inth/sdk/iab for an IAB policy,
// the first time it needs one. Vite compiles a module on its first import,
// which can outlast a vi.waitFor on a busy machine; importing them here does
// that while this file loads.
import '@inth/sdk/iab';

import '../browser/mount-prompt';
import '../browser/render-iab-prompt-into-slot';

/**
 * A prerendered page is built once and served to every visitor, so the
 * browser has to bring the visitor's own state to it.
 */

const OPTIONS: InthAstroOptions = {
	mode: testingMode({ policy: [testRule] }),
};

// The boot script registers this for a site that sets `iab`.
registerIAB(createTestPageIAB());

let client: AstroConsentClient | null = null;

const globals = window as unknown as Record<string, unknown>;

const clearCookies = function clearCookies(): void {
	for (const entry of document.cookie.split(';')) {
		const name = entry.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
	localStorage.clear();
};

/** Write a stored choice the way an earlier page view would have. */
const saveChoice = async function saveChoice(value: 'all' | 'none') {
	const kernel = createConsentKernel({
		// The earlier page offered the policy's categories.
		consentCategories: ['marketing', 'measurement'],
		initialPolicyResolution: testResolution(),
		now: Date.now(),
	});
	const persistence = createPersistence({ kernel });
	await kernel.commands.save(value);
	persistence.dispose();
	kernel.dispose();
};

/** Boot the way a prerendered page does: with the build's inlined config. */
const bootPrerendered = async function bootPrerendered(
	options: InthAstroOptions = OPTIONS
): Promise<AstroConsentClient> {
	const built = await resolveConsentContext({
		headers: new Headers(),
		options: resolveOptions(options),
		prerendered: true,
	});
	globals.__inthAstroConfig = JSON.parse(JSON.stringify(built.config));
	client = boot(resolveOptions(options));
	return client;
};

beforeEach(() => {
	clearCookies();
	document.body.innerHTML = '';
	globals.__inthAstro = undefined;
	globals.__inthAstroConfig = undefined;
	globals.__inthAstroActions = undefined;
});

afterEach(() => {
	client?.dispose();
	client = null;
});

describe('a prerendered page', () => {
	it("restores the visitor's stored choice", async () => {
		await saveChoice('none');

		const booted = await bootPrerendered();

		await vi.waitFor(() => {
			expect(booted.getConsent().policyPending).toBe(false);
		});
		const snapshot = booted.getConsent();
		expect(snapshot.explicitChoice?.categories.marketing?.value).toBe(false);
		expect(snapshot.activeUI).toBe('none');
	});

	it('asks a first-time visitor', async () => {
		const booted = await bootPrerendered();

		await vi.waitFor(() => {
			expect(booted.getConsent().activeUI).toBe('banner');
		});
		expect(booted.getConsent().explicitChoice).toBeNull();
	});

	it.each(['acceptAll', 'rejectAll'] as const)(
		'offers only Strictly necessary when nothing is declared, and %s answers it for good',
		async (action) => {
			const booted = await bootPrerendered();
			await vi.waitFor(() => {
				expect(booted.getConsent().activeUI).toBe('banner');
			});
			expect(booted.runtime.consentCategories).toEqual(['necessary']);

			await booted[action]();
			expect(booted.getConsent().activeUI).toBe('none');
			await vi.waitFor(() => expect(document.cookie).not.toBe(''));
			booted.dispose();

			const returning = await bootPrerendered();
			await vi.waitFor(() => {
				expect(returning.getConsent().policyPending).toBe(false);
			});
			expect(returning.getConsent().promptRequirement).toEqual({
				kind: 'none',
			});
			expect(returning.getConsent().activeUI).toBe('none');
		}
	);

	it('reveals the hidden prompt for a first-time visitor', async () => {
		const built = await resolveConsentContext({
			headers: new Headers(),
			options: resolveOptions(OPTIONS),
			prerendered: true,
		});
		const spot = document.createElement('div');
		spot.hidden = true;
		spot.setAttribute(
			PROMPT_SLOT_ATTRIBUTE,
			JSON.stringify({ classNames: promptClassNames, props: {} })
		);
		document.body.append(spot);
		spot.insertAdjacentHTML(
			'afterend',
			renderPromptHTML(
				resolvePromptModel({
					classNames: promptClassNames,
					options: built.options,
					props: {},
					snapshot: built.snapshot,
				}),
				true
			)
		);

		await bootPrerendered();

		await vi.waitFor(() => {
			const banner = document.querySelector<HTMLElement>(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner?.hidden).toBe(false);
		});
	});
});

describe('the spot <ConsentBanner /> leaves', () => {
	const leaveSpot = function leaveSpot(): void {
		const spot = document.createElement('div');
		spot.hidden = true;
		spot.setAttribute(
			PROMPT_SLOT_ATTRIBUTE,
			JSON.stringify({
				classNames: promptClassNames,
				props: { title: 'Cookies?' },
			})
		);
		document.body.append(spot);
	};

	it('gets the banner once the policy says one is due', async () => {
		leaveSpot();
		// No inlined resolution, as on a prerendered hosted page: the
		// browser's own init decides.
		client = boot(resolveOptions(OPTIONS));

		await vi.waitFor(() => {
			const banner = document.querySelector<HTMLElement>(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner?.hidden).toBe(false);
		});
		expect(
			document.querySelector('[data-testid="consent-banner-title"]')
				?.textContent
		).toBe('Cookies?');
	});

	it('renders for a client booted while a disposed one was still importing', async () => {
		leaveSpot();
		const first = await bootPrerendered();
		// The first client's render is still importing its chunk.
		first.dispose();
		client = null;
		await bootPrerendered();

		await vi.waitFor(() => {
			const banner = document.querySelector<HTMLElement>(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner?.hidden).toBe(false);
		});
	});

	it('renders into the new page when a swap lands mid-import', async () => {
		leaveSpot();
		await bootPrerendered();
		// A ClientRouter swap replaces the body before the chunk arrives, and
		// its attach() finds the render already in flight.
		document.body = document.createElement('body');
		leaveSpot();
		document.dispatchEvent(new Event('astro:after-swap'));

		await vi.waitFor(() => {
			const banner = document.querySelector<HTMLElement>(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner?.hidden).toBe(false);
		});
	});

	it('stays empty for a visitor who already chose', async () => {
		await saveChoice('all');
		leaveSpot();
		client = boot(resolveOptions(OPTIONS));

		await vi.waitFor(() => {
			expect(client?.getConsent().policyPending).toBe(false);
		});
		expect(document.querySelector(`[${PROMPT_SLOT_ATTRIBUTE}]`)).not.toBeNull();
		expect(
			document.querySelector('[data-testid="consent-banner-root"]')
		).toBeNull();
	});
});

describe('the spot <IABConsentBanner /> leaves', () => {
	const IAB_OPTIONS: InthAstroOptions = {
		consentCategories: ['necessary', 'marketing'],
		iab: { cmpId: 160, gvl: MINIMAL_GVL as never },
		mode: testingMode({
			policy: [
				{
					categories: ['marketing'],
					id: 'iab',
					match: { fallback: true },
					model: 'iab',
					prompt: 'choice',
					scopeMode: 'permissive',
				} as never,
			],
		}),
	};

	const leaveSpots = function leaveSpots(): void {
		const standard = document.createElement('div');
		standard.hidden = true;
		standard.setAttribute(
			PROMPT_SLOT_ATTRIBUTE,
			JSON.stringify({ classNames: promptClassNames, props: {} })
		);
		const iab = document.createElement('div');
		iab.hidden = true;
		iab.setAttribute(
			IAB_PROMPT_SLOT_ATTRIBUTE,
			JSON.stringify({ classNames: iabPromptClassNames, props: {} })
		);
		document.body.append(standard, iab);
	};

	it('gets the IAB banner, not the standard one, under an IAB policy', async () => {
		leaveSpots();
		client = boot(resolveOptions(IAB_OPTIONS));

		await vi.waitFor(() => {
			const banner = document.querySelector<HTMLElement>(
				'[data-testid="iab-consent-banner-root"]'
			);
			expect(banner?.hidden).toBe(false);
		});
		expect(
			document.querySelector('[data-testid="consent-banner-root"]')
		).toBeNull();
		expect(document.querySelector(`[${PROMPT_SLOT_ATTRIBUTE}]`)).not.toBeNull();
	});

	it('gets the IAB banner on a site whose other regions use a Card', async () => {
		const standard = document.createElement('div');
		standard.hidden = true;
		standard.setAttribute(
			PROMPT_SLOT_ATTRIBUTE,
			JSON.stringify({ classNames: promptClassNames, props: {} })
		);
		const iab = document.createElement('div');
		iab.hidden = true;
		iab.setAttribute(
			IAB_PROMPT_SLOT_ATTRIBUTE,
			JSON.stringify({ classNames: iabPromptClassNames, props: {} })
		);
		document.body.append(standard, iab);
		client = boot(
			resolveOptions({
				...IAB_OPTIONS,
				presentation: { prompt: { container: { type: 'card' } } },
			})
		);

		await vi.waitFor(() => {
			const banner = document.querySelector<HTMLElement>(
				'[data-testid="iab-consent-banner-root"]'
			);
			expect(banner?.hidden).toBe(false);
		});
		expect(
			document.querySelector('[data-testid="consent-banner-root"]')
		).toBeNull();
	});

	it('keeps rendering after an IAB-only page had nothing to render', async () => {
		// Only the IAB spot, under a policy that is not IAB: neither banner
		// renders here, and that must not leave rendering stuck.
		const iab = document.createElement('div');
		iab.hidden = true;
		iab.setAttribute(
			IAB_PROMPT_SLOT_ATTRIBUTE,
			JSON.stringify({ classNames: iabPromptClassNames, props: {} })
		);
		document.body.append(iab);
		client = boot(resolveOptions(OPTIONS));
		await vi.waitFor(() => {
			expect(client?.getConsent().activeUI).toBe('banner');
		});
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 20);
		});

		// A ClientRouter swap to a page with the standard banner's spot.
		document.body = document.createElement('body');
		leaveSpots();
		document.querySelector(`[${IAB_PROMPT_SLOT_ATTRIBUTE}]`)?.remove();
		document.dispatchEvent(new Event('astro:after-swap'));

		await vi.waitFor(() => {
			expect(
				document.querySelector<HTMLElement>(
					'[data-testid="consent-banner-root"]'
				)?.hidden
			).toBe(false);
		});
	});

	it('leaves a non-IAB policy to the standard banner', async () => {
		leaveSpots();
		client = boot(resolveOptions(OPTIONS));

		await vi.waitFor(() => {
			expect(
				document.querySelector('[data-testid="consent-banner-root"]')
			).not.toBeNull();
		});
		expect(
			document.querySelector('[data-testid="iab-consent-banner-root"]')
		).toBeNull();
	});
});
