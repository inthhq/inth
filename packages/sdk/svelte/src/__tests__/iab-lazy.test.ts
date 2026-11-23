/**
 * `@inth/sdk/iab` must not reach an app that did not ask for IAB.
 *
 * The provider sits in every SvelteKit app's layout chunk, so a static
 * import of the TCF implementation costs sites that never show a TCF
 * surface 3.3 KB gzipped there (measured on the SvelteKit bench). Two
 * things keep it out, and both are asserted here: no module an app loads
 * for the banner imports `@inth/sdk/iab` for a value, and the runtime only
 * gets a `createIAB` — the thing that triggers the dynamic import — when
 * `iab` is configured.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { isIABConfigured } from '../lib/lazy-create-iab';
import type { ConsentManagerOptions } from '../lib/manager-options.model';
import { testing } from '../lib/testing';
import ProviderOnlyFixture from './fixtures/provider-only-fixture.svelte';

interface WindowWithTCF extends Window {
	__tcfapi?: unknown;
}

// Resolved from this module, not `process.cwd()`: a root `vitest`
// invocation runs every workspace project from the repository root, and
// `<repo>/src/lib` does not exist.
const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), '../lib');

const source = function source(relativePath: string): string {
	return readFileSync(join(LIB_DIR, relativePath), 'utf8');
};

const mounted: ReturnType<typeof mount>[] = [];

const mountProvider = function mountProvider(
	options: Partial<ConsentManagerOptions>
) {
	const target = document.createElement('div');
	document.body.append(target);
	const app = mount(ProviderOnlyFixture, {
		props: {
			options: {
				mode: testing(),
				persistence: false,
				...options,
			} as ConsentManagerOptions,
		},
		target,
	});
	mounted.push(app);
};

afterEach(() => {
	for (const app of mounted.splice(0)) {
		void unmount(app);
	}
	(window as WindowWithTCF).__tcfapi = undefined;
});

describe('lazy IAB loading', () => {
	test.each([
		'components/inth-provider.svelte',
		'manager-options.model.ts',
		'get-consent-context.svelte.ts',
		'index.ts',
		'lazy-create-iab.ts',
	])('%s has no value import of `@inth/sdk/iab`', (file) => {
		const text = source(file);
		const imports = text.match(
			/^\s*import\s+(?!type\b)[^;]*'@inth\/sdk\/iab'/gmu
		);

		expect(imports).toBeNull();
	});

	test('never installs the CMP for a provider without `iab`', async () => {
		mountProvider({});

		await vi.waitFor(() => {
			expect(document.querySelector('[data-testid="render-child"]')).not.toBe(
				null
			);
		});
		// Long enough for a dynamic import to have landed, had one started.
		await sleep(50);
		expect((window as WindowWithTCF).__tcfapi).toBeUndefined();
	});

	test('loads the CMP once `iab` is configured', async () => {
		mountProvider({ iab: { cmpId: 42, enabled: true } });

		// The CMP arrives through a dynamic import, so the first run pays
		// for transforming `@inth/sdk/iab` as well as loading it.
		await vi.waitFor(
			() => {
				expect((window as WindowWithTCF).__tcfapi).toBeTypeOf('function');
			},
			{ timeout: 10_000 }
		);
	});

	test('`isIABConfigured` matches what the runtime would mount', () => {
		expect(isIABConfigured(undefined)).toBe(false);
		expect(isIABConfigured(false)).toBe(false);
		expect(isIABConfigured({ cmpId: 42, enabled: false })).toBe(false);
		expect(isIABConfigured({ cmpId: 42 })).toBe(true);
		expect(isIABConfigured({ cmpId: 42, enabled: true })).toBe(true);
	});
});
