/**
 * The server leaves an engine preload after the boot data for a visitor the
 * engine must serve at once. The snapshot decides for most roots; a root
 * whose options need the engine from its first render, such as one with a
 * network blocker, is preloaded whatever the banner shows, since the
 * browser renders it eagerly and the blocker must be in place before the
 * page's code sends a request.
 */
import { renderToReadableStream } from 'react-dom/server';
import { beforeAll, expect, test } from 'vite-plus/test';

import {
	choiceRecords,
	matchedResolution,
	NOW,
	optInRule,
} from '../../../core/src/__tests__/fixtures/kernel-fixtures';
import { InthProvider } from '../root';
import type { InthProviderProps } from '../root';
import { transportMode } from './fixtures/transport-mode';

// A server process renders with the start module loaded; the first render
// in a process, before it loads, is `root-sync-render.test.tsx`'s case.
beforeAll(async () => {
	await import('@inth/sdk/runtime/script-server-start');
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
});

/** A fresh visitor the banner asks to choose: the engine can wait. */
const choiceState = () => ({
	initialPolicyResolution: matchedResolution(optInRule()),
	now: NOW,
});

const render = async (
	props: Partial<InthProviderProps> = {}
): Promise<string> => {
	const stream = await renderToReadableStream(
		<InthProvider
			options={{ mode: transportMode({ init: () => Promise.resolve({}) }) }}
			state={choiceState()}
			{...props}
		>
			<main id="page">Page</main>
		</InthProvider>
	);
	await stream.allReady;
	return new Response(stream).text();
};

/** Whether the script after the boot data preloads the engine's chunks. */
const hasEnginePreload = (html: string): boolean =>
	/<script data-inth-boot[^>]*>[^<]*<\/script><script[^>]*>[^<]*inth-engine-chunks[^<]*<\/script>/u.test(
		html
	);

/** The engine preload that the stored-choice check, run first, can skip. */
const preloadScript = (html: string): string | undefined =>
	/<script data-inth-boot[^>]*>[^<]*<\/script><script[^>]*>(?<code>[^<]*inth-engine-chunks[^<]*)<\/script>/u.exec(
		html
	)?.groups?.code;

/**
 * A returning visitor whose engine waits: the server leaves the check, and
 * a preload that runs only when the check finds the choice stale.
 */
const deferredPreload = (html: string): boolean =>
	html.includes('g.current=function') &&
	preloadScript(html)?.includes('__inthRender') === true;

/**
 * A visitor whose engine loads at once: no check, so the browser starts
 * the engine as its chunk runs, and a preload that always runs.
 */
const eagerPreload = (html: string): boolean =>
	!html.includes('g.current=function') &&
	preloadScript(html) !== undefined &&
	!preloadScript(html)?.includes('__inthRender');

test('a choice banner leaves the engine preload out', async () => {
	const html = await render();
	expect(html).toContain('data-inth-boot');
	expect(hasEnginePreload(html)).toBe(false);
});

test('a root with clearOnRevocation preloads the engine whatever the banner shows', async () => {
	// The cleanup of a denied category's cookies and storage runs only in
	// the engine.
	expect(hasEnginePreload(await render({ clearOnRevocation: {} }))).toBe(true);
});

test('a root with a network blocker preloads the engine whatever the banner shows', async () => {
	const html = await render({ networkBlocker: { rules: [] } });
	expect(hasEnginePreload(html)).toBe(true);
	// Turned off, the blocker asks nothing of the engine.
	expect(
		hasEnginePreload(
			await render({ networkBlocker: { enabled: false, rules: [] } })
		)
	).toBe(false);
});

/** A returning visitor who granted marketing and sees no banner. */
const grantedState = () => {
	const resolution = matchedResolution(optInRule());
	return {
		initialPolicyResolution: resolution,
		initialRecords: choiceRecords(
			{ marketing: true },
			{ confirmedAt: NOW - 1000, fingerprint: resolution.fingerprints.choice }
		),
		now: NOW,
	};
};

const plainPixel = {
	category: 'marketing',
	id: 'pixel',
	src: 'https://cdn.example.com/pixel.js',
};

test('a returning visitor whose scripts the root starts itself gets a preload the check can skip', async () => {
	const html = await render({ scripts: [plainPixel], state: grantedState() });
	expect(deferredPreload(html)).toBe(true);
});

test('a returning visitor with a script that needs the loader keeps the engine preload', async () => {
	// The browser loads the engine at once for it: without the preload the
	// engine's chunks would wait for the first-load chunk to run.
	const html = await render({
		scripts: [{ ...plainPixel, onLoad: () => undefined }],
		state: grantedState(),
	});
	expect(eagerPreload(html)).toBe(true);
});

test('a returning visitor whose root cannot start its scripts keeps the engine preload', async () => {
	const html = await render({
		persistence: false,
		scripts: [plainPixel],
		state: grantedState(),
	});
	expect(eagerPreload(html)).toBe(true);
});

test.each([
	[
		'persistence.skipHydration: false',
		{ persistence: { skipHydration: false } },
	],
	['no request clock', { state: { ...grantedState(), now: undefined } }],
] as [string, Partial<InthProviderProps>][])(
	'a returning visitor keeps the engine preload when the stored-choice check is off (%s)',
	async (_case, props) => {
		// The server leaves no stored-choice check, so the browser cannot
		// confirm the choice and loads the engine at once.
		const html = await render({ state: grantedState(), ...props });
		expect(eagerPreload(html)).toBe(true);
	}
);

test('a returning visitor with a stored-choice check gets a preload the check can skip', async () => {
	// The browser runs the check first; the preload runs only when the
	// check finds a newer denial, a GPC signal or an expired decision, and
	// so the engine loads at once.
	const html = await render({ state: grantedState() });
	expect(deferredPreload(html)).toBe(true);
});

const startedPixel = {
	...plainPixel,
	serverStart: () => ({ code: '' }),
};

test('a returning visitor whose server-start script the server emits gets a preload the check can skip', async () => {
	const html = await render({ scripts: [startedPixel], state: grantedState() });
	expect(deferredPreload(html)).toBe(true);
});

test.each([
	['returns nothing', [{ ...startedPixel, serverStart: () => undefined }]],
	[
		'throws',
		[
			{
				...startedPixel,
				serverStart: () => {
					throw new Error('setup failed');
				},
			},
		],
	],
	[
		'shares a resourceKey',
		[
			{ ...startedPixel, resourceKey: 'shared' },
			{ ...startedPixel, id: 'other', resourceKey: 'shared' },
		],
	],
] as [string, InthProviderProps['scripts']][])(
	'a returning visitor whose serverStart %s keeps the engine preload',
	async (_case, scripts) => {
		// The server start emits nothing for it, so the browser loads the
		// engine at once to run it.
		const html = await render({ scripts, state: grantedState() });
		expect(eagerPreload(html)).toBe(true);
	}
);

test.each([
	['an enabled network blocker', { networkBlocker: { rules: [] } }],
	['clearOnRevocation', { clearOnRevocation: {} }],
	[
		'enabled: false',
		{
			options: {
				enabled: false,
				mode: transportMode({ init: () => Promise.resolve({}) }),
			},
		},
	],
] as [string, Partial<InthProviderProps>][])(
	'a returning visitor whose root needs the engine at once (%s) gets no stored-choice check',
	async (_case, props) => {
		// Without the check the browser starts the engine's download as
		// `InthProvider`'s chunk runs, before React reaches the root.
		const html = await render({ state: grantedState(), ...props });
		expect(eagerPreload(html)).toBe(true);
	}
);
