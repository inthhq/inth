/**
 * A container whose chunk fails to load after the early-tap script hid the
 * banner for a tap: the banner shows again, keeps the server's markup while
 * the chunk loads again, and renders once it is in.
 */
import { setChunkImportForTest } from '@inth/sdk/runtime/import-chunk';
import { EARLY_TAP_STYLE_ID } from '@inth/sdk/runtime/page-globals';
import { Suspense, act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { deferredContainer } from '../prompt';
import type { PromptSurfaceOptions } from '../prompt-surface';
import type * as StripModule from '../strip';

const RETRY_MS = 20;

const Strip = (props: Pick<PromptSurfaceOptions, 'title'>) => (
	<div
		data-testid="consent-banner-root"
		id="strip"
	>
		{props.title}
	</div>
);
const module = { Strip };

/** Fails the first import, then loads. */
const failingOnce = () =>
	vi
		.fn<() => Promise<typeof module>>()
		.mockRejectedValueOnce(new TypeError('Failed to fetch chunk'))
		.mockResolvedValue(module);

/** The style the early-tap script adds to hide a tapped banner. */
const hideForTap = (): HTMLStyleElement => {
	const style = document.createElement('style');
	style.id = EARLY_TAP_STYLE_ID;
	style.textContent = '[data-testid="consent-banner-root"]{display:none}';
	document.head.append(style);
	return style;
};

let host: HTMLDivElement;

beforeEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	host = document.createElement('div');
	document.body.append(host);
});

afterEach(() => {
	setChunkImportForTest();
	host.remove();
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
});

test('a container chunk that fails shows a tapped banner again and loads again', async () => {
	const style = hideForTap();
	const importModule = failingOnce();
	const container = deferredContainer(
		importModule,
		(loaded) => loaded.Strip as never,
		RETRY_MS
	);
	await container.preload();
	expect(style.isConnected).toBe(false);
	expect(importModule).toHaveBeenCalledTimes(2);
});

test('a hydrating banner keeps the server markup while its failed container chunk loads again', async () => {
	// The server rendered the banner with its chunk in.
	const loaded = deferredContainer(
		() => Promise.resolve(module),
		(chunk) => chunk.Strip as never
	);
	await loaded.preload();
	const page = (Container: typeof loaded.Container) => (
		<Suspense fallback={null}>
			<Container {...({ title: 'Cookies' } as PromptSurfaceOptions)} />
		</Suspense>
	);
	host.innerHTML = renderToString(page(loaded.Container));
	const serverBanner = host.querySelector('#strip');
	expect(serverBanner).not.toBeNull();
	const style = hideForTap();

	// In the browser the chunk fails once.
	const importModule = failingOnce();
	const client = deferredContainer(
		importModule,
		(chunk) => chunk.Strip as never,
		RETRY_MS
	);
	const recoverable = vi.fn();
	const root = await act(() =>
		hydrateRoot(host, page(client.Container), {
			onRecoverableError: recoverable,
		})
	);
	await vi.waitFor(() => {
		expect(style.isConnected).toBe(false);
	});
	// Still the server's banner, not an error fallback.
	expect(host.querySelector('#strip')).toBe(serverBanner);
	await vi.waitFor(() => {
		expect(importModule).toHaveBeenCalledTimes(2);
	});
	await act(async () => {
		await new Promise((resolve) => {
			setTimeout(resolve, RETRY_MS);
		});
	});
	expect(host.querySelector('#strip')).toBe(serverBanner);
	expect(recoverable).not.toHaveBeenCalled();
	act(() => {
		root.unmount();
	});
});

/**
 * What a browser that keeps a failed import (Chromium before 156, Firefox
 * before 155) answers every `import()` of the strip's chunk after one
 * failed download: the same error, without a request.
 */
const keptFailure = () =>
	vi
		.fn<() => Promise<typeof StripModule>>()
		.mockRejectedValue(
			new TypeError(
				'Failed to fetch dynamically imported module: http://localhost/assets/strip.js'
			)
		);

test('a container chunk the browser keeps failing loads again from its URL', async () => {
	const strip = await import('../strip');
	const importUrl = vi.fn((_url: string) => Promise.resolve(strip));
	setChunkImportForTest({ importUrl, keepsFailedImports: () => true });
	const importModule = keptFailure();
	const pick = vi.fn((loaded: typeof strip) => loaded.BannerSurface);
	const container = deferredContainer(importModule, pick, RETRY_MS);
	await container.preload();
	// In on the first try: no second load a while later.
	expect(importModule).toHaveBeenCalledOnce();
	expect(importUrl).toHaveBeenCalledExactlyOnceWith(
		'http://localhost/assets/strip.js?inth-retry=1'
	);
	expect(pick).toHaveLastReturnedWith(strip.BannerSurface);
});

test('a URL that exports the container under other names is not used', async () => {
	// A bundler that re-exports the chunk's namespace under a short name.
	const importUrl = vi.fn(async (_url: string) => ({
		t: await import('../strip'),
	}));
	setChunkImportForTest({ importUrl, keepsFailedImports: () => true });
	const importModule = keptFailure();
	const container = deferredContainer(
		importModule,
		(loaded) => loaded.BannerSurface,
		RETRY_MS
	);
	await container.preload();
	expect(importModule).toHaveBeenCalledTimes(3);
	expect(importUrl).toHaveBeenCalled();
});
