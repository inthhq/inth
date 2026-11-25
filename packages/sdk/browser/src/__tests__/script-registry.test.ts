/**
 * `experimentalScriptRegistry` in the client options, or in a `config`
 * call a script-tag page queues, reaches the core runtime: an integration
 * init lists loads from the registry's URL with its hash.
 */
import type { KernelTransport, ProviderTransportFactory } from '@inth/sdk-core';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { createConsentClient } from '../client';
import type {
	ConsentClient,
	ConsentClientOptions,
} from '../consent-client.model';
import { installGlobal } from '../global';
import { createTestingGlobal } from '../testing-global';
import type { TestingGlobalApi } from '../testing-global';

const VENDOR_SRC = 'https://cdn.vendor.example/vendor.js';
const REGISTRY_SRC = 'https://acme.inth.app/scripts/vendor@0123456789abcdef.js';
const REGISTRY_INTEGRITY =
	'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';

/** Options whose init lists the registry's copy of an integration. */
const listing: ConsentClientOptions = {
	mode: Object.assign(
		() =>
			({
				init: () =>
					Promise.resolve({
						scriptRegistry: {
							sources: {
								vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
							},
						},
					}),
				save: () => Promise.resolve({ ok: true }),
			}) as unknown as KernelTransport,
		{ kind: 'custom' as const }
	) as ProviderTransportFactory,
	persistence: false,
	reloadOnConsentRevoked: false,
	// A script `@inth/integrations` built, which loads without consent.
	scripts: [
		{
			category: 'necessary',
			id: 'vendor',
			integration: 'vendor',
			src: VENDOR_SRC,
		},
	],
	ui: false,
};

const testWindow = window as Window & { inth?: unknown };
let client: ConsentClient | TestingGlobalApi | undefined;

/** The vendor's script tag, once the loader inserted it. */
const loadedTag = async () => {
	const tag = () =>
		document.head.querySelector<HTMLScriptElement>(
			`script[src="${REGISTRY_SRC}"], script[src="${VENDOR_SRC}"]`
		);
	await vi.waitFor(() => expect(tag()).not.toBeNull());
	return {
		integrity: tag()?.getAttribute('integrity'),
		src: tag()?.getAttribute('src'),
	};
};

afterEach(() => {
	client?.dispose?.();
	client = undefined;
	testWindow.inth = undefined;
	document.head.replaceChildren();
});

describe('createConsentClient()', () => {
	it.each([
		[true, { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC }],
		[undefined, { integrity: null, src: VENDOR_SRC }],
	])(
		'with experimentalScriptRegistry: %s loads %o',
		async (experimentalScriptRegistry, expected) => {
			client = createConsentClient({ ...listing, experimentalScriptRegistry });
			client.start();

			expect(await loadedTag()).toEqual(expected);
		}
	);
});

describe('a queued config call', () => {
	it.each([
		[true, { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC }],
		[undefined, { integrity: null, src: VENDOR_SRC }],
	])(
		'with experimentalScriptRegistry: %s loads %o',
		async (experimentalScriptRegistry, expected) => {
			testWindow.inth = [
				['config', { ...listing, experimentalScriptRegistry }],
			];
			client = installGlobal(createTestingGlobal({ pkg: '@inth/sdk/test' }));
			client.init();

			expect(await loadedTag()).toEqual(expected);
		}
	);
});
