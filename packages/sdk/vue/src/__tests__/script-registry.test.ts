/**
 * `experimentalScriptRegistry` in the plugin's config reaches the core
 * runtime: an integration `/v1/consent/init` lists loads from the registry's URL with
 * its hash.
 */
import type { Script } from '@inth/sdk/engine';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { translations } from '@inth/sdk/translations/en';
import { afterEach, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h } from 'vue';

import { inth } from '../index';

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

/** The `/v1/consent/init` answer, listing the registry's copy of `vendor`. */
const init = {
	branding: 'inth',
	location: { countryCode: 'US', regionCode: null },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			countryCode: 'US',
			regionCode: null,
			rules: [
				{
					id: 'policy_us',
					match: { isDefault: true },
					model: 'opt-out',
					prompt: 'none',
				},
			],
		})
	),
	scriptRegistry: {
		sources: { vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC } },
	},
	translations: { language: 'en', translations },
};

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
	vi.unstubAllGlobals();
	document.head.replaceChildren();
});

/** Mounts an app with the plugin, and returns the vendor's script tag. */
const loadedTag = async (experimentalScriptRegistry?: boolean) => {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => Promise.resolve(new Response(JSON.stringify(init))))
	);
	const container = document.createElement('div');
	document.body.append(container);
	const app = createApp(defineComponent({ setup: () => () => h('main') }));
	app.use(inth, {
		experimentalScriptRegistry,
		projectUrl: 'https://consent.example.test',
		scripts: [vendor],
	});
	app.mount(container);
	cleanups.push(() => {
		app.unmount();
		container.remove();
	});
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

test('loads an integration from the registry source init lists', async () => {
	expect(await loadedTag(true)).toEqual({
		integrity: REGISTRY_INTEGRITY,
		src: REGISTRY_SRC,
	});
});

test('loads the vendor URL without the option', async () => {
	expect(await loadedTag()).toEqual({ integrity: null, src: VENDOR_SRC });
});
