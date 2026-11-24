/**
 * `experimentalScriptRegistry` in the integration options reaches the page
 * runtime: an integration the server's init lists loads from the
 * registry's URL with its hash.
 *
 * Its own file, because the script loader registration is page-wide.
 */
import { createScriptLoader } from '@inth/sdk/modules/script-loader';
import { afterEach, beforeAll, expect, it } from 'vite-plus/test';

import { boot, registerRuntimeModules } from '../client';
import type { AstroConsentClient } from '../client';
import { resolveOptions } from '../integration';
import { testing as testingMode } from '../testing';
import { testResolution, testRule } from './policy-fixture';

const VENDOR_SRC = 'https://cdn.vendor.example/vendor.js';
const REGISTRY_SRC = 'https://acme.inth.app/scripts/vendor@0123456789abcdef.js';
const REGISTRY_INTEGRITY =
	'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';

let client: AstroConsentClient | null = null;

/** Boots the page as the server rendered it, and returns the vendor's tag. */
const loadedTag = (experimentalScriptRegistry?: boolean) => {
	// The server's init, with the registry's list, as the page carries it.
	(window as unknown as Record<string, unknown>).__inthAstroConfig = {
		initialPolicyResolution: testResolution(),
		initialScriptRegistry: {
			sources: {
				vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
			},
		},
		initialTranslations: { language: 'en', translations: {} },
	};
	client = boot(
		resolveOptions({
			consentCategories: ['necessary', 'measurement'],
			experimentalScriptRegistry,
			mode: testingMode({ policy: [testRule] }),
			// A script `@inth/integrations` built, which loads without consent.
			scripts: [
				{
					category: 'necessary',
					id: 'vendor',
					integration: 'vendor',
					src: VENDOR_SRC,
				},
			],
		})
	);
	const tag = document.querySelector(
		`script[src="${REGISTRY_SRC}"], script[src="${VENDOR_SRC}"]`
	);
	return {
		integrity: tag?.getAttribute('integrity'),
		src: tag?.getAttribute('src'),
	};
};

beforeAll(() => {
	registerRuntimeModules({ createScriptLoader });
});

afterEach(() => {
	client?.dispose();
	client = null;
	document.head.innerHTML = '';
	(window as unknown as Record<string, unknown>).__inthAstro = undefined;
});

it('loads an integration from the registry source init lists', () => {
	expect(loadedTag(true)).toEqual({
		integrity: REGISTRY_INTEGRITY,
		src: REGISTRY_SRC,
	});
});

it('loads the vendor URL without the option', () => {
	expect(loadedTag()).toEqual({ integrity: null, src: VENDOR_SRC });
});
