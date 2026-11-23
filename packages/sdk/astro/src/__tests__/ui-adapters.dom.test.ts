/**
 * Mount/close/destroy for each shipped dialog adapter.
 *
 * The surfaces themselves are stubbed through `registerDialogSurface`: what
 * matters here is the seam — that each adapter mounts into the host element,
 * renders the requested dialog kind against the page runtime, closes through
 * the kernel rather than the DOM, and leaves nothing behind on destroy.
 */

import { createConsentRuntime } from '@inth/sdk/runtime';
import type { ConsentRuntime } from '@inth/sdk/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InthResolvedOptions } from '../inth-options.model';
import { reactDialogAdapter } from '../ui/react';
import { registerDialogSurface } from '../ui/register-dialog-adapter';
import type { ConsentDialogKind } from '../ui/register-dialog-adapter';
import { vueDialogAdapter } from '../ui/vue';
// The Vue adapter imports its plugin on first mount. Vite compiles it on that
// first import, which takes seconds on a busy machine; importing it here does
// that while this file loads, outside any test timeout.
import '@inth/vue/vue-plugin';

const OPTIONS = {
	consentCategories: ['necessary', 'marketing'],
	endpoints: { enabled: false, initPath: '/i', manifestPath: '/m' },
	mode: { type: 'hosted', url: 'https://consent.example.test' },
	ui: 'react',
} as unknown as InthResolvedOptions;

const runtimes: ConsentRuntime[] = [];
const hosts: HTMLElement[] = [];

const createRuntime = function createRuntime(): ConsentRuntime {
	const runtime = createConsentRuntime({
		pkg: '@c15t/astro-test',
		projectUrl: 'https://consent.example.test',
	});
	runtimes.push(runtime);
	return runtime;
};

/** A stub surface: the seam is under test, not the dialog markup. */
const renderNothing = function renderNothing(): null {
	return null;
};

const reactSurface = { default: renderNothing };
const vueSurface = { default: { setup: () => renderNothing } };

const createHost = function createHost(): HTMLElement {
	const host = document.createElement('div');
	document.body.appendChild(host);
	hosts.push(host);
	return host;
};

afterEach(() => {
	for (const runtime of runtimes.splice(0)) {
		runtime.dispose();
	}
	for (const host of hosts.splice(0)) {
		host.remove();
	}
});

describe('the react dialog adapter', () => {
	it('mounts the registered surface with the page runtime', async () => {
		let seen: { runtime?: unknown; kind?: ConsentDialogKind } = {};
		const recordProps = function recordProps(props: {
			runtime: unknown;
			kind: ConsentDialogKind;
		}): null {
			seen = props;
			return null;
		};
		registerDialogSurface('react', () =>
			Promise.resolve({ default: recordProps })
		);
		const runtime = createRuntime();

		const handle = await reactDialogAdapter.mount({
			kind: 'iab',
			options: OPTIONS,
			runtime,
			target: createHost(),
		});
		// React 19 renders concurrently, so the first render can land after
		// several macrotasks on a busy machine.
		await vi.waitFor(() => expect(seen.runtime).toBe(runtime));
		expect(seen.kind).toBe('iab');
		await handle.destroy();
	});

	it('hands the island the legal links and no design', async () => {
		let seen: Record<string, unknown> = {};
		const recordProps = function recordProps(
			props: Record<string, unknown>
		): null {
			seen = props;
			return null;
		};
		registerDialogSurface('react', () =>
			Promise.resolve({ default: recordProps })
		);
		const handle = await reactDialogAdapter.mount({
			kind: 'preferences',
			legalLinks: ['privacyPolicy'],
			options: OPTIONS,
			runtime: createRuntime(),
			target: createHost(),
		});
		await vi.waitFor(() => expect(seen.legalLinks).toEqual(['privacyPolicy']));
		expect(seen).not.toHaveProperty('design');
		await handle.destroy();
	});

	it('closes through the kernel rather than the DOM', async () => {
		registerDialogSurface('react', () => Promise.resolve(reactSurface));
		const runtime = createRuntime();
		runtime.kernel.set.activeUI('dialog');

		const handle = await reactDialogAdapter.mount({
			kind: 'preferences',
			options: OPTIONS,
			runtime,
			target: createHost(),
		});
		handle.close();

		expect(runtime.kernel.getSnapshot().activeUI).toBe('none');
		await handle.destroy();
	});

	it('leaves the banner the kernel returned to when closed again', async () => {
		registerDialogSurface('react', () => Promise.resolve(reactSurface));
		const runtime = createRuntime();
		runtime.kernel.set.activeUI('banner');

		const handle = await reactDialogAdapter.mount({
			kind: 'preferences',
			options: OPTIONS,
			runtime,
			target: createHost(),
		});
		handle.close();

		expect(runtime.kernel.getSnapshot().activeUI).toBe('banner');
		await handle.destroy();
	});

	it('warms its chunks without mounting anything', async () => {
		const host = createHost();
		registerDialogSurface('react', () => Promise.resolve(reactSurface));
		await reactDialogAdapter.preload?.();
		expect(host.innerHTML).toBe('');
	});
});

describe('the vue dialog adapter', () => {
	it('mounts the registered surface with the page runtime', async () => {
		let seen: { kind?: ConsentDialogKind } = {};
		registerDialogSurface('vue', () =>
			Promise.resolve({
				default: {
					props: ['kind'],
					setup(props: { kind: ConsentDialogKind }) {
						seen = props;
						return renderNothing;
					},
				},
			})
		);
		const runtime = createRuntime();

		const handle = await vueDialogAdapter.mount({
			kind: 'iab',
			options: OPTIONS,
			runtime,
			target: createHost(),
		});

		expect(seen.kind).toBe('iab');
		await handle.destroy();
		// The plugin borrows the runtime, so unmounting must not kill it.
		expect(runtime.kernel.getSnapshot()).toBeTruthy();
	});

	it('closes through the kernel rather than the DOM', async () => {
		registerDialogSurface('vue', () => Promise.resolve(vueSurface));
		const runtime = createRuntime();
		runtime.kernel.set.activeUI('dialog');

		const handle = await vueDialogAdapter.mount({
			kind: 'preferences',
			options: OPTIONS,
			runtime,
			target: createHost(),
		});
		handle.close();

		expect(runtime.kernel.getSnapshot().activeUI).toBe('none');
		await handle.destroy();
	});

	it('warms its chunks without mounting anything', async () => {
		const host = createHost();
		registerDialogSurface('vue', () => Promise.resolve(vueSurface));
		await vueDialogAdapter.preload?.();
		expect(host.innerHTML).toBe('');
	});
});
