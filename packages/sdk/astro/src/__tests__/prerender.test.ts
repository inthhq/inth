import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { PROMPT_SLOT_ATTRIBUTE } from '../banner/prompt-slot.model';
import ConsentBanner from '../components/prompt.astro';
import { resolveOptions } from '../integration';
import { createConsentMiddleware } from '../create-consent-middleware';
import { hosted as hostedMode } from '../mode';
import { promptClassNames } from '../prompt/prompt-class-names';
import { buildBannerRevealScript, resolveConsentContext } from '../server';
import { testing as testingMode } from '../testing';
import type { InthAstroOptions, InthLocals } from '../inth-options.model';
import { testRule } from './policy-fixture';

let container: AstroContainer;

beforeAll(async () => {
	container = await AstroContainer.create();
});

const OFFLINE: InthAstroOptions = {
	mode: testingMode({ policy: [testRule] }),
};

/**
 * Run the middleware the way `astro build` does for a prerendered page.
 * The request's headers throw when read: Astro warns on any access to them
 * during a prerender, and they describe the build machine, not a visitor.
 */
const runPrerendered = async function runPrerendered(
	options: InthAstroOptions,
	fetchImpl?: typeof globalThis.fetch
): Promise<InthLocals> {
	const middleware = createConsentMiddleware(resolveOptions(options), {
		fetch: fetchImpl,
	});
	const locals = {} as { inth: InthLocals };
	const request = {
		get headers(): Headers {
			throw new Error('read a prerendered request’s headers');
		},
		url: 'https://example.com/',
	};
	await middleware(
		{ isPrerendered: true, locals, request } as never,
		vi.fn(() => new Response('ok')) as never
	);
	return locals.inth;
};

describe('prerendered routes', () => {
	it('never reads the request headers', async () => {
		const inth = await runPrerendered(OFFLINE);
		expect(inth.prerendered).toBe(true);
	});

	it('leaves visitor state out of the inlined config', async () => {
		// A consent cookie on the build request must not become everyone's.
		const inth = await resolveConsentContext({
			headers: new Headers({
				cookie: 'inth=v=3&sid=sub_build',
				'sec-gpc': '1',
			}),
			options: resolveOptions(OFFLINE),
			prerendered: true,
		});
		// Any `initialRecords` at all stop the browser reading its own cookie.
		expect(inth.config).not.toHaveProperty('initialRecords');
		expect(inth.config).not.toHaveProperty('now');
		expect(inth.config).not.toHaveProperty('initialPrivacySignals');
	});

	it('resolves an offline policy at build time', async () => {
		const inth = await runPrerendered(OFFLINE);
		expect(inth.hasConsentUi).toBe(true);
		expect(inth.shouldShowBanner).toBe(true);
		expect(inth.config.initialPolicyResolution).toBeDefined();
	});

	it('leaves a hosted policy for the browser to resolve', async () => {
		const fetchImpl = vi.fn();
		const inth = await runPrerendered(
			{ mode: hostedMode(), projectUrl: 'https://consent.example.com' },
			fetchImpl as never
		);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(inth.hasPolicy).toBe(false);
	});
});

describe('<ConsentBanner /> on a prerendered page', () => {
	it('renders hidden for the browser to reveal', async () => {
		const html = await container.renderToString(ConsentBanner, {
			locals: { inth: await runPrerendered(OFFLINE) },
		});
		expect(html).toMatch(/data-testid="consent-banner-root"[^>]*\shidden/u);
		expect(html).toContain('data-inth-visible="false"');
		// Revealed at first paint for a visitor with nothing stored.
		expect(html).toContain(
			buildBannerRevealScript(undefined, 'consent-banner')
		);
	});

	it('adds no reveal script to a server-rendered banner', async () => {
		const html = await container.renderToString(ConsentBanner, {
			locals: {
				inth: await resolveConsentContext({
					headers: new Headers(),
					options: resolveOptions(OFFLINE),
				}),
			},
		});
		expect(html).not.toContain('localStorage.getItem');
	});

	it('leaves a spot with its props when the policy is unknown', async () => {
		const html = await container.renderToString(ConsentBanner, {
			locals: {
				inth: await runPrerendered({
					mode: hostedMode(),
					projectUrl: 'https://consent.example.com',
				}),
			},
			props: { title: 'Cookies?' },
		});
		expect(html).not.toContain('data-testid="consent-banner-root"');
		const spot = new JSDOM(html).window.document.querySelector(
			`[${PROMPT_SLOT_ATTRIBUTE}]`
		);
		const data = JSON.parse(spot?.getAttribute(PROMPT_SLOT_ATTRIBUTE) ?? '');
		expect(data.props).toEqual({ title: 'Cookies?' });
		expect(data.classNames.surface.root).toBe(promptClassNames.surface.root);
	});
});
