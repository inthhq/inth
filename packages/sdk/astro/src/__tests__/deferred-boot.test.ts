import { EARLY_CONSENT_TAP_SCRIPT } from '@inth/sdk/surface-actions';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { canDeferEngine } from '../banner/deferred-boot.model';
import { CONSENT_BOOT_ATTRIBUTE } from '../browser/consent-boot.model';
import ConsentScript from '../components/consent-script.astro';
import ConsentBanner from '../components/prompt.astro';
import { resolveOptions } from '../integration';
import type { InthAstroOptions, InthLocals } from '../inth-options.model';
import { resolveConsentContext } from '../server';
import { testing as testingMode } from '../testing';
import { testRule } from './policy-fixture';

let container: AstroContainer;

beforeAll(async () => {
	container = await AstroContainer.create();
});

const buildLocals = async function buildLocals(
	options: Partial<InthAstroOptions> = {}
): Promise<InthLocals> {
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
	/<script[^>]*type="application\/json"[^>]*data-inth-boot[^>]*>(?<json>[^<]*)<\/script>/u;
// The prompt's first-paint rules: its tokens, shell and container once the
// server knows the policy, else `first-paint`.
const FIRST_PAINT =
	/<style[^>]*data-inth-styles="inth-(?:first-paint|tokens)"/u;

const bootOf = function bootOf(html: string): { d: boolean; s: unknown } {
	const match = html.match(BOOT);
	expect(match).not.toBeNull();
	return JSON.parse(match?.groups?.json ?? '{}') as { d: boolean; s: unknown };
};

describe('canDeferEngine', () => {
	it('lets the engine wait for a visitor the prompt asks to choose, whose taps the early-tap script holds', async () => {
		const { options, snapshot } = await buildLocals();
		expect(snapshot.activeUI).toBe('banner');
		expect(canDeferEngine(snapshot, options)).toBe(true);
	});

	it.each([
		[
			'a script that may run before any choice',
			{
				scripts: [
					{ alwaysLoad: true, category: 'measurement', id: 'a', src: '/a.js' },
				],
			},
		],
		['GPP', { gpp: true }],
		[
			'declared vendors',
			{
				vendors: [{ category: 'measurement', id: 'youtube', name: 'YouTube' }],
			},
		],
		[
			'a script that names a vendor',
			{
				scripts: [
					{ category: 'measurement', id: 'a', src: '/a.js', vendor: 'acme' },
				],
			},
		],
		[
			'a network blocker',
			{
				networkBlocker: {
					rules: [{ category: 'measurement', domain: 'example.com' }],
				},
			},
		],
		['IAB', { iab: { cmpId: 160 } }],
	] as const)('loads the engine at once for %s', async (_label, options) => {
		const { options: resolved, snapshot } = await buildLocals(
			options as Partial<InthAstroOptions>
		);
		expect(canDeferEngine(snapshot, resolved)).toBe(false);
	});

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
				options
			)
		).toBe(false);
		expect(canDeferEngine({ ...snapshot, activeUI: 'none' }, options)).toBe(
			false
		);
	});
});

describe('<ConsentBanner /> boot data', () => {
	it('leaves the snapshot ahead of the prompt, lets the engine wait, and holds taps until the prompt takes over', async () => {
		const locals = await buildLocals();
		const html = await container.renderToString(ConsentBanner, {
			locals: { inth: { ...locals, nonce: 'n0' } },
		});
		const boot = bootOf(html);
		expect(boot.d).toBe(true);
		expect(boot.s).toEqual(JSON.parse(JSON.stringify(locals.snapshot)));
		expect(html.indexOf(CONSENT_BOOT_ATTRIBUTE)).toBeGreaterThan(-1);
		const root = html.indexOf('data-testid="consent-banner-root"');
		expect(root).toBeGreaterThan(html.indexOf(CONSENT_BOOT_ATTRIBUTE));
		// Ahead of the prompt, so it holds a tap the moment the prompt paints.
		expect(html.indexOf(EARLY_CONSENT_TAP_SCRIPT)).toBeGreaterThan(-1);
		expect(html.indexOf(EARLY_CONSENT_TAP_SCRIPT)).toBeLessThan(root);
	});

	it('holds taps on a prompt the engine must serve at once, until its chunk mounts', async () => {
		const html = await container.renderToString(ConsentBanner, {
			locals: { inth: await buildLocals({ gpp: true }) },
		});
		expect(bootOf(html).d).toBe(false);
		expect(html).toContain(EARLY_CONSENT_TAP_SCRIPT);
	});

	it('leaves no early-tap script inside a server island, which arrives after the page script', async () => {
		const html = await container.renderToString(ConsentBanner, {
			locals: { inth: await buildLocals() },
			props: { inlineStyles: false },
		});
		expect(html).not.toContain(EARLY_CONSENT_TAP_SCRIPT);
	});

	it('leaves the snapshot on a page without a banner, without letting the engine wait', async () => {
		const locals = await buildLocals();
		const html = await container.renderToString(ConsentScript, {
			locals: { inth: { ...locals, shouldShowBanner: false } },
		});
		expect(bootOf(html).d).toBe(false);
		expect(html).not.toContain(EARLY_CONSENT_TAP_SCRIPT);
	});

	it('never lets the engine wait on a page every visitor shares', async () => {
		const locals = await buildLocals();
		const html = await container.renderToString(ConsentScript, {
			locals: { inth: { ...locals, prerendered: true } },
		});
		expect(bootOf(html).d).toBe(false);
	});
});

describe('first-paint rules for a visitor the server shows no banner', () => {
	it('are left out of the head', async () => {
		const locals = await buildLocals();
		const head = await container.renderToString(ConsentScript, {
			locals: { inth: { ...locals, shouldShowBanner: false } },
		});
		expect(head).not.toMatch(FIRST_PAINT);
		// The engine still boots from the config.
		expect(head).toContain('data-inth-config');
	});

	it('are still inlined for a banner rendered with `force`', async () => {
		const locals = {
			inth: { ...(await buildLocals()), shouldShowBanner: false },
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
				inth: { ...locals, prerendered: true, shouldShowBanner: false },
			},
		});
		expect(head).toMatch(FIRST_PAINT);
	});
});
