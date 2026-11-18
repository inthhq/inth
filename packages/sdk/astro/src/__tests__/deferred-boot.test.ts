import { EARLY_CONSENT_TAP_SCRIPT } from '@c15t/core/surface-actions';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';

import { canDeferEngine } from '../banner/deferred-boot';
import { CONSENT_BOOT_ATTRIBUTE } from '../browser/shell';
import ConsentScript from '../components/consent-script.astro';
import ConsentBanner from '../components/prompt.astro';
import { resolveOptions } from '../integration';
import { resolveConsentContext } from '../server';
import { testing as testingMode } from '../testing';
import type { C15tAstroOptions, C15tLocals } from '../types';
import { testRule } from './policy-fixture';

let container: AstroContainer;

beforeAll(async () => {
	container = await AstroContainer.create();
});

const buildLocals = async function buildLocals(
	options: Partial<C15tAstroOptions> = {}
): Promise<C15tLocals> {
	return await resolveConsentContext({
		headers: new Headers(),
		options: resolveOptions({
			consentCategories: ['necessary', 'measurement', 'marketing'],
			mode: testingMode({ policy: [testRule] }),
			...options,
		}),
	});
};

const BOOT =
	/<script[^>]*type="application\/json"[^>]*data-c15t-boot[^>]*>(?<json>[^<]*)<\/script>/u;
const FIRST_PAINT = /<style[^>]*data-c15t-styles="c15t-first-paint"/u;

const bootOf = function bootOf(html: string): { d: boolean; s: unknown } {
	const match = html.match(BOOT);
	expect(match).not.toBeNull();
	return JSON.parse(match?.groups?.json ?? '{}') as { d: boolean; s: unknown };
};

describe('canDeferEngine', () => {
	it('lets an opt-in choice banner wait for the engine', async () => {
		const { options, snapshot } = await buildLocals();
		expect(canDeferEngine(snapshot, options, false)).toBe(true);
	});

	it.each([
		['a blocking banner', {}, true],
		[
			'a script that may run before any choice',
			{
				scripts: [
					{ alwaysLoad: true, category: 'measurement', id: 'a', src: '/a.js' },
				],
			},
			false,
		],
		['GPP', { gpp: true }, false],
		[
			'declared vendors',
			{
				vendors: [{ category: 'measurement', id: 'youtube', name: 'YouTube' }],
			},
			false,
		],
		[
			'a script that names a vendor',
			{
				scripts: [
					{ category: 'measurement', id: 'a', src: '/a.js', vendor: 'acme' },
				],
			},
			false,
		],
		[
			'a network blocker',
			{
				networkBlocker: {
					rules: [{ category: 'measurement', domain: 'example.com' }],
				},
			},
			false,
		],
		['IAB', { iab: { cmpId: 160 } }, false],
	] as const)(
		'loads the engine at once for %s',
		async (_label, options, blocking) => {
			const { options: resolved, snapshot } = await buildLocals(
				options as Partial<C15tAstroOptions>
			);
			expect(canDeferEngine(snapshot, resolved, blocking)).toBe(false);
		}
	);

	it('loads the engine at once once something optional is granted', async () => {
		const { options, snapshot } = await buildLocals();
		expect(
			canDeferEngine(
				{
					...snapshot,
					effectivePermissions: {
						...snapshot.effectivePermissions,
						measurement: true,
					},
				},
				options,
				false
			)
		).toBe(false);
		expect(
			canDeferEngine({ ...snapshot, activeUI: 'none' }, options, false)
		).toBe(false);
	});
});

describe('<ConsentBanner /> boot data', () => {
	it('leaves the snapshot and the early-tap script ahead of the banner', async () => {
		const locals = await buildLocals();
		const html = await container.renderToString(ConsentBanner, {
			locals: { c15t: { ...locals, nonce: 'n0' } },
		});
		const boot = bootOf(html);
		expect(boot.d).toBe(true);
		expect(boot.s).toEqual(JSON.parse(JSON.stringify(locals.snapshot)));
		expect(html).toContain(CONSENT_BOOT_ATTRIBUTE);
		const early = html.indexOf(EARLY_CONSENT_TAP_SCRIPT);
		expect(early).toBeGreaterThan(-1);
		expect(html.indexOf('data-testid="consent-banner-root"')).toBeGreaterThan(
			early
		);
		expect(html).toMatch(/<script[^>]*nonce="n0"[^>]*>\(function\(w,d,k\)/u);
	});

	it('marks a banner the engine must serve at once, without the early-tap script', async () => {
		const html = await container.renderToString(ConsentBanner, {
			locals: { c15t: await buildLocals({ gpp: true }) },
		});
		expect(bootOf(html).d).toBe(false);
		expect(html).not.toContain(EARLY_CONSENT_TAP_SCRIPT);
	});

	it('leaves no early-tap script inside a server island, which arrives after the page script', async () => {
		const html = await container.renderToString(ConsentBanner, {
			locals: { c15t: await buildLocals() },
			props: { inlineStyles: false },
		});
		expect(html).not.toContain(EARLY_CONSENT_TAP_SCRIPT);
	});

	it('leaves the snapshot on a page without a banner, without letting the engine wait', async () => {
		const locals = await buildLocals();
		const html = await container.renderToString(ConsentScript, {
			locals: { c15t: { ...locals, shouldShowBanner: false } },
		});
		expect(bootOf(html).d).toBe(false);
		expect(html).not.toContain(EARLY_CONSENT_TAP_SCRIPT);
	});

	it('never lets the engine wait on a page every visitor shares', async () => {
		const locals = await buildLocals();
		const html = await container.renderToString(ConsentScript, {
			locals: { c15t: { ...locals, prerendered: true } },
		});
		expect(bootOf(html).d).toBe(false);
	});
});

describe('first-paint rules for a visitor the server shows no banner', () => {
	it('are left out of the head', async () => {
		const locals = await buildLocals();
		const head = await container.renderToString(ConsentScript, {
			locals: { c15t: { ...locals, shouldShowBanner: false } },
		});
		expect(head).not.toMatch(FIRST_PAINT);
		// The engine still boots from the config.
		expect(head).toContain('data-c15t-config');
	});

	it('are still inlined for a banner rendered with `force`', async () => {
		const locals = {
			c15t: { ...(await buildLocals()), shouldShowBanner: false },
		};
		const head = await container.renderToString(ConsentScript, { locals });
		const banner = await container.renderToString(ConsentBanner, {
			locals,
			props: { force: true },
		});
		expect(head).not.toMatch(FIRST_PAINT);
		expect(banner).toMatch(FIRST_PAINT);
	});

	it('are still inlined on a page every visitor shares', async () => {
		const locals = await buildLocals();
		const head = await container.renderToString(ConsentScript, {
			locals: {
				c15t: { ...locals, prerendered: true, shouldShowBanner: false },
			},
		});
		expect(head).toMatch(FIRST_PAINT);
	});
});
