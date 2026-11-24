/**
 * The server render of an `iab` policy under a provider without `iab`
 * throws the same error the browser does, so a SvelteKit page fails
 * instead of shipping no consent UI.
 */
import { MINIMAL_GVL } from '@inth/conformance/fixtures/gvl';
import type { GlobalVendorList } from '@inth/sdk/engine';
import { render } from 'svelte/server';
import { describe, expect, test } from 'vite-plus/test';

import type { ConsentManagerOptions } from '../lib/types';
import BannerFixture from './fixtures/banner-fixture.svelte';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

const GVL = MINIMAL_GVL as unknown as GlobalVendorList;

const options = (iab?: ConsentManagerOptions['iab']): ConsentManagerOptions =>
	({
		iab,
		mode: transportMode({}),
		persistence: false,
		prefetch: {
			...policyFixture({}, { categories: ['marketing'], model: 'iab' }),
			initialIab: { cmpId: 28, enabled: true, gvl: GVL },
		},
	}) as ConsentManagerOptions;

describe('the server render of an `iab` policy', () => {
	test('throws without `iab`', () => {
		// `render()` produces the HTML when `body` is read.
		expect(
			() => render(BannerFixture, { props: { options: options() } }).body
		).toThrow(
			"inth: this visitor's policy uses IAB TCF, but `iab` is not set."
		);
	});

	test('renders with `iab`', () => {
		expect(
			() =>
				render(BannerFixture, { props: { options: options({ cmpId: 28 }) } })
					.body
		).not.toThrow();
	});
});
