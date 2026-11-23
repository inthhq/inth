/**
 * When the visitor's consent already lets a script run, the server render
 * starts it from the end of `<body>`, before hydration.
 * Nothing starts while the policy asks the visitor to choose, or from a
 * shared render, which carries no request clock.
 *
 * Runs in the `ssr` project, so the provider is server-compiled as it is
 * during a SvelteKit render.
 */
import type { Script } from '@inth/sdk/engine';
import type { RuntimePrefetch } from '@inth/sdk/runtime';
import type { PolicyRule } from '@inth/sdk/schema/types';
import { resolvePolicyRules } from '@inth/sdk/schema/types';
import { render } from 'svelte/server';
import { afterEach, beforeAll, expect, test } from 'vitest';

import InthProvider from '../lib/components/inth-provider.svelte';
import type { ConsentManagerOptions } from '../lib/consent-manager-options.model';
import { setRequestEvent } from '../lib/kit/__tests__/app-server';
import { createEvent } from '../lib/kit/__tests__/event';
import {
	createServerStartInjector,
	loadServerScriptStart,
} from '../lib/kit/load-server-script-start';
import { testing } from '../lib/testing';

const pixel: Script = {
	category: 'marketing',
	id: 'pixel',
	serverStart: () => ({ code: 'window.__pixel="a&b<c"' }),
	src: 'https://cdn.example.com/pixel.js',
};

/** A US-style policy: marketing runs until the visitor opts out. */
const optOut: PolicyRule = {
	id: 'policy_us',
	match: { isDefault: true },
	model: 'opt-out',
	prompt: 'none',
};

/** The page `inthHandle` sends: the render, after its page transform. */
const renderPage = function renderPage({
	rule = optOut,
	shared = false,
	scriptRegistry,
	...options
}: Partial<ConsentManagerOptions> & {
	rule?: PolicyRule;
	/** The registry list the server's init carries. */
	scriptRegistry?: RuntimePrefetch['initialScriptRegistry'];
	shared?: boolean;
}): string {
	// `inthHandle` makes the transform before SvelteKit renders the page.
	const event = createEvent();
	const inject = createServerStartInjector(event.locals);
	setRequestEvent(event);
	const { body, head } = render(InthProvider, {
		props: {
			options: {
				mode: testing(),
				persistence: false,
				prefetch: {
					initialPolicyResolution: resolvePolicyRules({
						countryCode: 'US',
						regionCode: null,
						rules: [rule],
					}),
					initialScriptRegistry: scriptRegistry,
					// A shared render's state carries no request clock.
					now: shared ? undefined : Date.now(),
				},
				scripts: [pixel],
				...options,
			} as ConsentManagerOptions,
		},
	});
	setRequestEvent(undefined);
	return inject(`<html><head>${head}</head><body>${body}</body></html>`, true);
};

/** The inline scripts the page ends its body with. */
const startScripts = (page: string): string[] =>
	[...page.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>(?=<\/body>)/gu)].map(
		([tag]) => tag
	);

beforeAll(async () => {
	await loadServerScriptStart();
});

afterEach(() => {
	setRequestEvent(undefined);
});

test('starts an allowed script from the end of the body, with the nonce', () => {
	const page = renderPage({ nonce: 'request-nonce' });
	const [start, ...rest] = startScripts(page);

	expect(rest).toEqual([]);
	expect(start).toMatch(/^<script nonce="request-nonce">/u);
	expect(start).toContain(JSON.stringify(pixel.src));
	expect(start).toContain('window.__pixel="a&b<c"');
	// The code never passes through the rendered markup.
	expect(page.indexOf('window.__pixel')).toBe(
		page.lastIndexOf('window.__pixel')
	);
});

test('starts nothing while the policy asks the visitor to choose', () => {
	expect(
		startScripts(renderPage({ rule: { ...optOut, prompt: 'choice' } }))
	).toEqual([]);
});

test('starts nothing from a shared render', () => {
	expect(startScripts(renderPage({ shared: true }))).toEqual([]);
});

test('starts nothing when the app turns the server start off', () => {
	expect(
		startScripts(renderPage({ scriptLoader: { serverStart: false } }))
	).toEqual([]);
});

test('starts nothing without scripts', () => {
	expect(startScripts(renderPage({ scripts: [] }))).toEqual([]);
});

test('starts an integration from the registry source init lists with experimentalScriptRegistry', () => {
	const registrySrc = 'https://acme.inth.app/scripts/pixel@0123456789abcdef.js';
	// The URL and attributes the start inserts the pixel's tag with.
	const started = (experimentalScriptRegistry?: boolean) => {
		const [start] = startScripts(
			renderPage({
				experimentalScriptRegistry,
				scriptRegistry: {
					sources: {
						pixel: { integrity: 'sha384-registry', src: registrySrc },
					},
				},
				scripts: [{ ...pixel, integration: 'pixel' }],
			})
		);
		return {
			...(/i\("pixel",(?<src>"[^"]+")(?:,\{"attributes":(?<attributes>\{[^}]*\}))?/u.exec(
				start ?? ''
			)?.groups ?? {}),
		};
	};

	expect(started(true)).toEqual({
		attributes: '{"integrity":"sha384-registry","crossorigin":"anonymous"}',
		src: JSON.stringify(registrySrc),
	});
	expect(started().src).toBe(JSON.stringify(pixel.src));
});
