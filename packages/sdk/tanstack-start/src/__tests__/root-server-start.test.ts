/**
 * `ConsentRoot` inlines a script that starts the vendor tags a visitor's
 * consent already allows, after the page content so it doesn't hold back
 * first paint. Prerendered HTML goes to every visitor, so it never starts
 * one.
 */
import type { Script } from '@inth/sdk/engine';
import { manifest } from '@inth/sdk/modes';
import { createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';

import { optOutRule } from '../../../core/src/__tests__/fixtures/kernel-fixtures';
import { ConsentRoot } from '../root';
import type { ConsentRootProps } from '../root';
import { resolveConsent } from '../server';
import { manifestOf } from './manifest-fixture';

const pixel: Script = {
	category: 'marketing',
	id: 'pixel',
	serverStart: () => ({ code: '' }),
	src: 'https://cdn.example.com/pixel.js',
};

/** A US-style policy: marketing runs until the visitor opts out. */
const optOutState = () =>
	resolveConsent({
		mode: manifest(),
		// A relative backend is the app's own route: no session report.
		projectUrl: '/api/inth',
		request: new Request('https://app.example.com/'),
		snapshot: manifestOf([optOutRule({ prompt: 'none' })]),
	});

const render = async (
	state: ConsentRootProps['state'],
	onError?: (error: unknown) => void
): Promise<string> => {
	const stream = await renderToReadableStream(
		createElement(
			ConsentRoot,
			{ scripts: [pixel], state },
			createElement('main', { id: 'page' }, 'Page')
		),
		{ onError }
	);
	await stream.allReady;
	return new Response(stream).text();
};

/**
 * `html` without the boot data a deferred root reads: the snapshot and
 * the engine-preload script after it, which carry no start script.
 */
/**
 * The HTML without the boot data a deferred root reads, its empty preload
 * slot, and the stored-choice check, which starts nothing itself.
 */
const withoutBootData = (html: string): string =>
	html.replace(
		/<script(?: nonce="[^"]*")?>(?:\(function\(\)\{var g=window\.__inthRender;[^]*?\}\)\(\))?<\/script><script data-inth-boot[^>]*>[^<]*<\/script><script[^>]*>[^<]*<\/script>/u,
		''
	);

afterEach(() => {
	vi.unstubAllEnvs();
});

test('renders the server start script after the page content', async () => {
	// The first render loads the start module; later renders, like a warm
	// server's, inline the script where the component sits.
	await render(await optOutState());
	const html = await render(await optOutState());

	const start = html.indexOf(JSON.stringify(pixel.src));
	expect(start).toBeGreaterThan(-1);
	expect(start).toBeGreaterThan(html.indexOf('</main>'));
});

test('starts the scripts from a streamed state', async () => {
	await render(optOutState());
	const html = await render(optOutState());

	expect(html).toContain(JSON.stringify(pixel.src));
});

test('starts nothing from a prerender', async () => {
	vi.stubEnv('TSS_PRERENDERING', 'true');
	await render(await optOutState());
	const html = await render(await optOutState());

	expect(html).toContain('<main id="page">Page</main>');
	expect(html).not.toContain(JSON.stringify(pixel.src));
});

test("renders no start script for a state that is no one visitor's", async () => {
	// Prerendered HTML, and the static root's `state={{}}`, would carry an
	// empty inline script that a hash-based policy has to allow.
	vi.stubEnv('TSS_PRERENDERING', 'true');
	const prerendered = await optOutState();
	vi.unstubAllEnvs();

	// `{}` as the static root passes it; the backend URL stands in for the
	// one `consentManifest()` supplies.
	const empty = { projectUrl: 'https://consent.example.com' };

	// A first render loads the start module, as in the tests above.
	await render(prerendered);
	const pages = await Promise.all([render(prerendered), render(empty)]);

	for (const html of pages) {
		expect(html).toContain('<main id="page">Page</main>');
		expect(html).not.toContain('<script');
	}
});

test('renders no start script for a streamed state that starts nothing', async () => {
	vi.stubEnv('TSS_PRERENDERING', 'true');
	const prerendered = Promise.resolve(await optOutState());
	vi.unstubAllEnvs();
	const rejected = Promise.reject(new Error('backend unreachable'));
	rejected.catch(() => undefined);

	await render(await optOutState());
	const pages = await Promise.all([render(prerendered), render(rejected)]);

	for (const html of pages) {
		expect(html).toContain('<main id="page">Page</main>');
		expect(withoutBootData(html)).not.toContain('<script');
	}
});

test('renders no start script when the app turns the server start off', async () => {
	await render(await optOutState());
	const stream = await renderToReadableStream(
		createElement(
			ConsentRoot,
			{
				scriptLoader: { serverStart: false },
				scripts: [pixel],
				state: await optOutState(),
			},
			createElement('main', { id: 'page' }, 'Page')
		)
	);
	await stream.allReady;
	const html = await new Response(stream).text();

	expect(html).toContain('<main id="page">Page</main>');
	expect(html).toContain('data-inth-boot');
	expect(withoutBootData(html)).not.toContain('<script');
});

test('renders without a server start when the state promise rejects', async () => {
	// The provider falls back to the transport for a rejected state; the
	// server start has to skip quietly, not fail the server render.
	const state = Promise.reject(new Error('backend unreachable'));
	state.catch(() => undefined);
	const onError = vi.fn();

	const html = await render(state, onError);

	expect(onError).not.toHaveBeenCalled();
	expect(html).toContain('<main id="page">Page</main>');
	expect(html).not.toContain(JSON.stringify(pixel.src));
});

/**
 * The root as React 18 runs it: React without `use`. React 19's renderer
 * still renders it, retrying on the thrown promise as React 18's does;
 * React 18.3.1's own renderer is checked outside CI.
 */
const importRootWithoutUse = async (): Promise<typeof ConsentRoot> => {
	vi.resetModules();
	// oxlint-disable-next-line anti-slop/no-module-mocking -- The repo installs only React 19; React 18 is React without `use`.
	vi.doMock('react', async (importOriginal) => {
		const actual = await importOriginal<Record<string, unknown>>();
		const react18 = { ...actual, use: undefined };
		return { ...react18, default: react18 };
	});
	return (await import('../root')).ConsentRoot;
};

test('starts the scripts from a streamed state on React 18, which has no `use`', async () => {
	try {
		const Root = await importRootWithoutUse();
		const onError = vi.fn();
		const stream = await renderToReadableStream(
			createElement(
				Root,
				{ scripts: [pixel], state: optOutState() },
				createElement('main', { id: 'page' }, 'Page')
			),
			{ onError }
		);
		await stream.allReady;
		const html = await new Response(stream).text();

		expect(onError).not.toHaveBeenCalled();
		const start = html.indexOf(JSON.stringify(pixel.src));
		expect(start).toBeGreaterThan(html.indexOf('</main>'));
	} finally {
		vi.doUnmock('react');
		vi.resetModules();
	}
});

test('finishes concurrent React 18 renders while a failed start module reloads', async () => {
	// Both renders wait on the first, failed load. The second load waits
	// for the test; a render that waited on the first must not wait on it.
	let loads = 0;
	let release: () => void = () => undefined;
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is a failed load of this module; no interface stands in for a dynamic import.
	vi.doMock('@inth/sdk/runtime/script-server-start', async () => {
		loads += 1;
		if (loads > 1) {
			await released;
		}
		throw new Error('chunk missing');
	});
	try {
		const Root = await importRootWithoutUse();
		const state = await optOutState();
		const renderPage = async () => {
			const stream = await renderToReadableStream(
				createElement(
					Root,
					{ scripts: [pixel], state },
					createElement('main', { id: 'page' }, 'Page')
				)
			);
			await stream.allReady;
			return new Response(stream).text();
		};

		const pages = await Promise.race([
			Promise.all([renderPage(), renderPage()]),
			new Promise<'waiting on the reload'>((resolve) => {
				setTimeout(() => resolve('waiting on the reload'), 1000);
			}),
		]);

		expect(pages).toHaveLength(2);
		for (const html of pages) {
			expect(html).toContain('<main id="page">Page</main>');
			expect(html).not.toContain(JSON.stringify(pixel.src));
		}
	} finally {
		release();
		vi.doUnmock('@inth/sdk/runtime/script-server-start');
		vi.doUnmock('react');
		vi.resetModules();
	}
});

test('leaves the boot data, and an empty script for the engine preload, for a visitor served at once', async () => {
	// Marketing may run now, so the browser loads the engine at once. Vite
	// gives it no chunk URLs to learn, so nothing is preloaded; the empty
	// script keeps the elements the browser renders.
	await render(await optOutState());
	const html = await render(await optOutState());

	const boot =
		/<script data-inth-boot[^>]*>(?<json>[^<]*)<\/script>(?<preload><script[^>]*>[^<]*<\/script>)/u.exec(
			html
		);
	expect(
		JSON.parse(boot?.groups?.json ?? '{}').s.effectivePermissions.marketing
	).toBe(true);
	expect(boot?.groups?.preload).toBe('<script></script>');
});

/** Server-renders `ConsentRoot` with `props`, after a first render. */
const renderWith = async (
	props: Partial<ConsentRootProps>
): Promise<string> => {
	await render(await optOutState());
	const stream = await renderToReadableStream(
		createElement(
			ConsentRoot,
			{ state: await optOutState(), ...props },
			createElement('main', { id: 'page' }, 'Page')
		)
	);
	await stream.allReady;
	return new Response(stream).text();
};

const CHECK = 'g.current=function';

test('a visitor whose root lets the engine wait gets the stored-choice check', async () => {
	expect(await renderWith({ scripts: [pixel] })).toContain(CHECK);
});

test.each<[string, Partial<ConsentRootProps>]>([
	['an enabled network blocker', { networkBlocker: { rules: [] } }],
	[
		'persistence: false, with a plain script',
		{
			persistence: false,
			scripts: [{ ...pixel, id: 'plain', serverStart: undefined }],
		},
	],
	[
		'a script that needs the loader',
		{
			scripts: [
				{
					...pixel,
					id: 'loader',
					onLoad: () => undefined,
					serverStart: undefined,
				},
			],
		},
	],
])(
	'a root that needs the engine at once (%s) gets no stored-choice check',
	async (_case, props) => {
		// Without the check the browser starts the engine's download as
		// `ConsentRoot`'s chunk runs, before React reaches the root.
		expect(await renderWith(props)).not.toContain(CHECK);
	}
);

test('runs each serverStart once per render', async () => {
	// The stored-choice check and the start script come from one plan, so
	// a stateful serverStart neither runs twice nor gives them two answers.
	await render(await optOutState());
	const serverStart = vi.fn(() => ({ code: '' }));
	const stream = await renderToReadableStream(
		createElement(
			ConsentRoot,
			{ scripts: [{ ...pixel, serverStart }], state: await optOutState() },
			createElement('main', { id: 'page' }, 'Page')
		)
	);
	await stream.allReady;
	const html = await new Response(stream).text();
	expect(html).toContain(JSON.stringify(pixel.src));
	expect(serverStart).toHaveBeenCalledTimes(1);
});

test('a render whose start module loads late names the start script’s render in its boot data', async () => {
	// The boot data renders while the module loads, and the start script
	// streams in once it has. A root that goes before that script runs ends
	// the render its boot data names, so the script must write that render.
	const state = await optOutState();
	let release: () => void = () => undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	vi.resetModules();
	// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is a late load of this module; no interface stands in for a dynamic import.
	vi.doMock('@inth/sdk/runtime/script-server-start', async (importOriginal) => {
		await gate;
		return importOriginal();
	});
	try {
		const { ConsentRoot: FreshRoot } = await import('../root');
		const stream = await renderToReadableStream(
			createElement(
				FreshRoot,
				{ scripts: [pixel], state },
				createElement('main', { id: 'page' }, 'Page')
			)
		);
		release();
		await stream.allReady;
		const html = await new Response(stream).text();

		expect(html).toContain(JSON.stringify(pixel.src));
		const boot = /<script data-inth-boot[^>]*>(?<data>[^<]*)<\/script>/u.exec(
			html
		)?.groups?.data;
		const parsed: unknown = JSON.parse(boot ?? '{}');
		const bootId =
			parsed && typeof parsed === 'object' && 'i' in parsed
				? parsed.i
				: undefined;
		const startId = /g\.id!==(?<id>"[^"]*")/u.exec(html)?.groups?.id;
		expect(bootId).toBeDefined();
		expect(startId && JSON.parse(startId)).toBe(bootId);
	} finally {
		vi.doUnmock('@inth/sdk/runtime/script-server-start');
		vi.resetModules();
	}
});

test('starts an integration from the registry source the manifest lists with experimentalScriptRegistry', async () => {
	const registrySrc = 'https://acme.inth.app/scripts/pixel@0123456789abcdef.js';
	const listedState = () =>
		resolveConsent({
			mode: manifest(),
			projectUrl: '/api/inth',
			request: new Request('https://app.example.com/'),
			snapshot: {
				...manifestOf([optOutRule({ prompt: 'none' })]),
				scriptRegistry: {
					sources: {
						pixel: { integrity: 'sha384-registry', src: registrySrc },
					},
				},
			},
		});
	const renderListed = async (experimentalScriptRegistry?: boolean) => {
		const stream = await renderToReadableStream(
			createElement(
				ConsentRoot,
				{
					options: { experimentalScriptRegistry },
					scripts: [{ ...pixel, integration: 'pixel' }],
					state: await listedState(),
				},
				createElement('main', { id: 'page' }, 'Page')
			)
		);
		await stream.allReady;
		return new Response(stream).text();
	};
	// The URL and attributes the server start inserts the pixel's tag with.
	const started = (html: string) =>
		/i\("pixel",(?<src>"[^"]+")(?:,\{"attributes":(?<attributes>\{[^}]*\}))?/u.exec(
			html
		)?.groups ?? {};
	// The first render loads the start module.
	await renderListed(true);

	expect({ ...started(await renderListed(true)) }).toEqual({
		attributes: '{"integrity":"sha384-registry","crossorigin":"anonymous"}',
		src: JSON.stringify(registrySrc),
	});
	expect(started(await renderListed()).src).toBe(JSON.stringify(pixel.src));
});
