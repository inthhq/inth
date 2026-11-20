/**
 * `experimentalScriptRegistry` on `InthProvider` reaches the core
 * runtime: an integration init lists loads from the registry's URL with
 * its hash.
 */
import type { Script } from '@inth/sdk/engine';
import { render } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';

import InthProvider from '../lib/components/inth-provider.svelte';
import type { ConsentManagerOptions } from '../lib/types';
import { transportMode } from './fixtures/transport-mode';

const VENDOR_SRC = 'https://cdn.vendor.example/vendor.js';
const REGISTRY_SRC = 'https://acme.inth.app/scripts/vendor@0123456789abcdef.js';
const REGISTRY_INTEGRITY =
	'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';

/** A script `@inth/integrations` built, which loads without consent. */
const vendor: Script = {
	category: 'necessary',
	id: 'vendor',
	integration: 'vendor',
	src: VENDOR_SRC,
};

/** A mode whose init lists the registry's copy of `vendor`. */
const listing = transportMode({
	init: () =>
		Promise.resolve({
			scriptRegistry: {
				sources: {
					vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
		}) as never,
	save: () => Promise.resolve({ ok: true }),
});

afterEach(() => {
	document.head.replaceChildren();
});

/** Renders the provider, and returns the vendor's script tag once loaded. */
const loadedTag = async (experimentalScriptRegistry?: boolean) => {
	const view = render(InthProvider, {
		props: {
			options: {
				experimentalScriptRegistry,
				iframeBlocker: false,
				mode: listing,
				persistence: false,
				scripts: [vendor],
			} as ConsentManagerOptions,
		},
	});
	const tag = () =>
		document.head.querySelector<HTMLScriptElement>(
			`script[src="${REGISTRY_SRC}"], script[src="${VENDOR_SRC}"]`
		);
	await vi.waitFor(() => expect(tag()).not.toBeNull());
	const loaded = {
		integrity: tag()?.getAttribute('integrity'),
		src: tag()?.getAttribute('src'),
	};
	view.unmount();
	return loaded;
};

test('loads an integration from the registry source init lists', async () => {
	expect(await loadedTag(true)).toEqual({
		integrity: REGISTRY_INTEGRITY,
		src: REGISTRY_SRC,
	});
});

test('loads the vendor URL without the option', async () => {
	expect(await loadedTag()).toEqual({ integrity: null, src: VENDOR_SRC });
});
