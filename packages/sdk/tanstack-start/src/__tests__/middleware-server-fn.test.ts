/**
 * `consentRequestMiddleware()` listed on a server function. TanStack Start
 * runs it in the function's middleware chain, where `next()` resolves to
 * the function's result and no response exists. 3.2's middleware read
 * `result.response.headers` there and crashed the page's server render.
 */
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { manifest } from '@inth/sdk/modes';
import { createServerFn } from '@tanstack/react-start';
import { createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { expect, test } from 'vitest';

import { optInRule } from '../../../core/src/__tests__/fixtures/kernel-fixtures';
import { consentRequestMiddleware } from '../middleware';
import type { ConsentRequestContext } from '../middleware';
import { InthProvider } from '../root';
import { createConsentStateHandler } from '../server';
import type { ConsentState } from '../server';
import { manifestOf } from './manifest-fixture';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

interface StartStorage {
	runWithStartContext: <Value>(
		context: unknown,
		fn: () => Promise<Value>
	) => Promise<Value>;
}

/** The directory of `name` as installed next to `from`'s package. */
const installedNextTo = (from: string, name: string): string =>
	realpathSync(join(from, '..', '..', name));

/**
 * Start's request store, from the copy `createServerFn` reads, so the
 * function runs as it does inside a request.
 */
const startStorage = async (): Promise<StartStorage> => {
	const start = realpathSync(
		join(packageRoot, 'node_modules/@tanstack/react-start')
	);
	const clientCore = installedNextTo(start, '@tanstack/start-client-core');
	const storage = installedNextTo(
		clientCore,
		'@tanstack/start-storage-context'
	);
	return (await import(
		pathToFileURL(join(storage, 'dist/esm/index.js')).href
	)) as StartStorage;
};

interface ServerFnInternals {
	__executeServer: (options: {
		data?: unknown;
		method: string;
	}) => Promise<{ result?: unknown; error?: unknown }>;
}

/** Runs a server function on the server, as a page's loader would. */
const callOnServer = async (fn: unknown, request: Request) => {
	const { runWithStartContext } = await startStorage();
	return await runWithStartContext(
		{
			contextAfterGlobalMiddlewares: {},
			executedRequestMiddlewares: new Set(),
			request,
			startOptions: {},
		},
		() => (fn as ServerFnInternals).__executeServer({ method: 'GET' })
	);
};

test('passes a server function result through', async () => {
	let seen: ConsentRequestContext['consent'] | undefined;
	const fn = createServerFn({ method: 'GET' })
		.middleware([consentRequestMiddleware()])
		// The Start compiler passes the client stub first; the handler runs
		// on the server.
		.handler(
			(() => undefined) as never,
			(({ context }: { context: ConsentRequestContext }) => {
				seen = context.consent;
				return { ok: true };
			}) as never
		);
	const request = new Request('https://app.example.com/', {
		headers: { 'cf-ipcountry': 'DE', 'sec-gpc': '1' },
	});

	const outcome = await callOnServer(fn, request);

	expect(outcome.error).toBeUndefined();
	expect(outcome.result).toEqual({ ok: true });
	expect(seen).toMatchObject({ country: 'DE', gpc: true });
	expect(request.headers.get('x-inth-country')).toBe('DE');
});

test('renders InthProvider from a server function that lists it', async () => {
	const request = new Request('https://app.example.com/', {
		headers: { 'cf-ipcountry': 'DE' },
	});
	const fn = createServerFn({ method: 'GET' })
		.middleware([consentRequestMiddleware()])
		.handler(
			(() => undefined) as never,
			createConsentStateHandler({
				mode: manifest(),
				// A relative backend is the app's own route: no session report.
				projectUrl: '/api/inth',
				request,
				snapshot: manifestOf([optInRule()]),
			}) as never
		);

	const outcome = await callOnServer(fn, request);
	expect(outcome.error).toBeUndefined();
	expect(request.headers.get('cookie')).toBeNull();

	const stream = await renderToReadableStream(
		createElement(
			InthProvider,
			{ state: outcome.result as ConsentState },
			createElement('main', { id: 'page' }, 'Page')
		)
	);
	await stream.allReady;
	const html = await new Response(stream).text();
	expect(html).toContain('<main id="page">Page</main>');
	// Resolved for this request: the banner's snapshot is in the HTML.
	expect(html).toContain('data-inth-boot');
	expect(html).toContain('"activeUI":"banner"');
});
