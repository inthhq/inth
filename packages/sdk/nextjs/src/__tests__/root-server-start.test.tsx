import type { Script } from '@inth/sdk/engine';
/**
 * The server start script waits for the page's stylesheets before it runs.
 * Rendered ahead of the page it holds the parser back and delays first
 * paint, so it must follow the page content.
 */
import { renderToReadableStream } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

import {
	choiceRecords,
	matchedResolution,
	NOW,
	optInRule,
} from '../../../core/src/__tests__/fixtures/kernel-fixtures';
import { deferConsent } from '../defer';
import { ConsentRoot } from '../root';
import type { ConsentRootProps } from '../root';
import { transportMode } from './fixtures/transport-mode';

const pixel: Script = {
	category: 'marketing',
	id: 'pixel',
	serverStart: () => ({ code: '' }),
	src: 'https://cdn.example.com/pixel.js',
};

const grantedState = () => {
	const resolution = matchedResolution(optInRule());
	return {
		initialPolicyResolution: resolution,
		initialRecords: choiceRecords(
			{ marketing: true },
			{
				confirmedAt: NOW - 1000,
				fingerprint: resolution.fingerprints.choice,
			}
		),
		now: NOW,
	};
};

const render = async (
	state: ConsentRootProps['state'] = grantedState(),
	onError?: (error: unknown) => void
): Promise<string> => {
	const stream = await renderToReadableStream(
		<ConsentRoot
			options={{ mode: transportMode({ init: () => Promise.resolve({}) }) }}
			scripts={[pixel]}
			state={state}
		>
			<main id="page">Page</main>
		</ConsentRoot>,
		{ onError }
	);
	await stream.allReady;
	return new Response(stream).text();
};

test('renders the server start script after the page content', async () => {
	// The first render loads the start module; later renders, like a warm
	// server's, inline the script where the component sits.
	await render();
	const html = await render();

	const start = html.indexOf(JSON.stringify(pixel.src));
	expect(start).toBeGreaterThan(-1);
	expect(start).toBeGreaterThan(html.indexOf('</main>'));
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

test('renders no inline script without a state', async () => {
	// A static or cached page has no state. An empty inline script there
	// would still need a CSP nonce.
	const stream = await renderToReadableStream(
		<ConsentRoot
			options={{ mode: transportMode({ init: () => Promise.resolve({}) }) }}
			scripts={[pixel]}
		>
			<main id="page">Page</main>
		</ConsentRoot>
	);
	await stream.allReady;
	const html = await new Response(stream).text();

	expect(html).toContain('<main id="page">Page</main>');
	expect(html).not.toContain('<script');
});

test('renders no inline script when the app turns the server start off', async () => {
	await render();
	const stream = await renderToReadableStream(
		<ConsentRoot
			options={{ mode: transportMode({ init: () => Promise.resolve({}) }) }}
			scriptLoader={{ serverStart: false }}
			scripts={[pixel]}
			state={grantedState()}
		>
			<main id="page">Page</main>
		</ConsentRoot>
	);
	await stream.allReady;
	const html = await new Response(stream).text();

	expect(html).toContain('<main id="page">Page</main>');
	// Only the boot data a deferred root reads, which never runs, the
	// stored-choice check, the engine preload (the browser loads the engine
	// at once for a script the server no longer starts), and empty slots
	// the browser hydrates.
	const scripts = [
		...html.matchAll(/<script(?<attributes>[^>]*)>(?<body>.*?)<\/script>/gu),
	];
	expect(
		scripts.filter(
			({ groups }) =>
				!groups?.attributes?.includes('type="application/json"') &&
				groups?.body !== '' &&
				!groups?.body?.includes('g.current=function') &&
				!groups?.body?.includes('c15t-engine-chunks')
		)
	).toEqual([]);
	expect(html).not.toContain(JSON.stringify(pixel.src));
});

test('renders the empty script the browser hydrates when the start module fails to load', async () => {
	// The browser always renders an empty script here; rendering nothing on
	// the server would fail hydration.
	vi.resetModules();
	// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is a failed load of this module; no interface stands in for a dynamic import.
	vi.doMock('@inth/sdk/runtime/script-server-start', () => {
		throw new Error('chunk missing');
	});
	try {
		const { ConsentRoot: FreshRoot } = await import('../root');
		const onError = vi.fn();
		const stream = await renderToReadableStream(
			<FreshRoot
				options={{ mode: transportMode({ init: () => Promise.resolve({}) }) }}
				scripts={[pixel]}
				state={grantedState()}
			>
				<main id="page">Page</main>
			</FreshRoot>,
			{ onError }
		);
		await stream.allReady;
		const html = await new Response(stream).text();

		expect(onError).not.toHaveBeenCalled();
		expect(html).toMatch(
			/<\/main><!--\$--><script[^>]*><\/script><script data-c15t-boot[^>]*>[^<]*<\/script><script[^>]*>[^<]*c15t-engine-chunks[^<]*<\/script><!--\$--><script[^>]*><\/script><!--\/\$-->/u
		);
		expect(html).not.toContain(JSON.stringify(pixel.src));
	} finally {
		vi.doUnmock('@inth/sdk/runtime/script-server-start');
		vi.resetModules();
	}
});

test('a render whose start module loads late names the start script’s render in its boot data', async () => {
	// The boot data renders while the module loads, and the start script
	// streams in once it has. A root that goes before that script runs ends
	// the render its boot data names, so the script must write that render.
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
			<FreshRoot
				options={{ mode: transportMode({ init: () => Promise.resolve({}) }) }}
				scripts={[pixel]}
				state={grantedState()}
			>
				<main id="page">Page</main>
			</FreshRoot>
		);
		release();
		await stream.allReady;
		const html = await new Response(stream).text();

		expect(html).toContain(JSON.stringify(pixel.src));
		const boot = /<script data-c15t-boot[^>]*>(?<data>[^<]*)<\/script>/u.exec(
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

test('renders the server start on React 18, which has no `use`', async () => {
	try {
		const Root = await importRootWithoutUse();
		const onError = vi.fn();
		const stream = await renderToReadableStream(
			<Root
				options={{ mode: transportMode({ init: () => Promise.resolve({}) }) }}
				scripts={[pixel]}
				state={Promise.resolve(grantedState())}
			>
				<main id="page">Page</main>
			</Root>,
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

test('finishes the render on React 18 when the start module fails to load', async () => {
	// Without `use`, the retry calls the loader again. A new import there
	// would suspend the render again, on every retry.
	// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is a failed load of this module; no interface stands in for a dynamic import.
	vi.doMock('@inth/sdk/runtime/script-server-start', () => {
		throw new Error('chunk missing');
	});
	try {
		const Root = await importRootWithoutUse();
		const stream = await renderToReadableStream(
			<Root
				options={{ mode: transportMode({ init: () => Promise.resolve({}) }) }}
				scripts={[pixel]}
				state={grantedState()}
			>
				<main id="page">Page</main>
			</Root>
		);
		await stream.allReady;
		const html = await new Response(stream).text();

		expect(html).toMatch(
			/<\/main><!--\$--><script[^>]*><\/script><script data-c15t-boot[^>]*>[^<]*<\/script><script[^>]*>[^<]*c15t-engine-chunks[^<]*<\/script><!--\$--><script[^>]*><\/script><!--\/\$-->/u
		);
	} finally {
		vi.doUnmock('@inth/sdk/runtime/script-server-start');
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
		const renderPage = async () => {
			const stream = await renderToReadableStream(
				<Root
					options={{ mode: transportMode({ init: () => Promise.resolve({}) }) }}
					scripts={[pixel]}
					state={grantedState()}
				>
					<main id="page">Page</main>
				</Root>
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
			expect(html).toMatch(
				/<\/main><!--\$--><script[^>]*><\/script><script data-c15t-boot[^>]*>[^<]*<\/script><script[^>]*>[^<]*c15t-engine-chunks[^<]*<\/script><!--\$--><script[^>]*><\/script><!--\/\$-->/u
			);
		}
	} finally {
		release();
		vi.doUnmock('@inth/sdk/runtime/script-server-start');
		vi.doUnmock('react');
		vi.resetModules();
	}
});

test('a deferred consent island keeps the server start script', async () => {
	// `deferConsent` delays the browser's chunks, not the server render, so
	// a returning visitor's granted scripts still start at parse time.
	await render();
	const Island = deferConsent(() =>
		Promise.resolve({
			default: ({ state }: { state: ConsentRootProps['state'] }) => (
				<ConsentRoot
					options={{ mode: transportMode({ init: () => Promise.resolve({}) }) }}
					scripts={[pixel]}
					state={state}
				/>
			),
		})
	);
	const stream = await renderToReadableStream(
		<>
			<main id="page">Page</main>
			<Island state={grantedState()} />
		</>
	);
	await stream.allReady;
	const html = await new Response(stream).text();

	expect(html.indexOf(JSON.stringify(pixel.src))).toBeGreaterThan(
		html.indexOf('</main>')
	);
});

test('runs each serverStart once per render', async () => {
	// The stored-choice check and the start script come from one plan, so
	// a stateful serverStart neither runs twice nor gives them two answers.
	await render();
	const serverStart = vi.fn(() => ({ code: '' }));
	const stream = await renderToReadableStream(
		<ConsentRoot
			options={{ mode: transportMode({ init: () => Promise.resolve({}) }) }}
			scripts={[{ ...pixel, serverStart }]}
			state={grantedState()}
		>
			<main id="page">Page</main>
		</ConsentRoot>
	);
	await stream.allReady;
	const html = await new Response(stream).text();
	expect(html).toContain(JSON.stringify(pixel.src));
	expect(serverStart).toHaveBeenCalledTimes(1);
});

test('starts an integration from the registry source the state lists with experimentalScriptRegistry', async () => {
	const registrySrc = 'https://acme.inth.app/scripts/pixel@0123456789abcdef.js';
	const renderListed = async (experimentalScriptRegistry?: {
		requireSignatures: boolean;
	}) => {
		const stream = await renderToReadableStream(
			<ConsentRoot
				options={{
					experimentalScriptRegistry,
					mode: transportMode({ init: () => Promise.resolve({}) }),
				}}
				scripts={[{ ...pixel, integration: 'pixel' }]}
				state={{
					...grantedState(),
					initialScriptRegistry: {
						sources: {
							pixel: { integrity: 'sha384-registry', src: registrySrc },
						},
					},
				}}
			>
				<main id="page">Page</main>
			</ConsentRoot>
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
	await renderListed({ requireSignatures: false });

	expect({
		...started(await renderListed({ requireSignatures: false })),
	}).toEqual({
		attributes: '{"integrity":"sha384-registry","crossorigin":"anonymous"}',
		src: JSON.stringify(registrySrc),
	});
	expect(started(await renderListed()).src).toBe(JSON.stringify(pixel.src));
});
