/**
 * The banner's preloads are lowered only on a page the plugin marked as
 * rendering no banner. A visitor who sees the banner keeps its chunks at
 * their priority.
 */
import { describe, expect, test } from 'vite-plus/test';

import {
	QUIET_BANNER_CONTEXT_KEY,
	quietBannerHead,
} from '../runtime/server/banner-preload-priority';

const LINK =
	'<link rel="modulepreload" as="script" crossorigin href="/_nuxt/Prompt.js">';

describe('quietBannerHead', () => {
	test('lowers the banner on a page that renders none', () => {
		expect(
			quietBannerHead([LINK], ['Prompt.js'], {
				[QUIET_BANNER_CONTEXT_KEY]: true,
			})
		).toEqual([LINK.replace('<link', '<link fetchpriority="low"')]);
	});

	test('leaves the banner alone where the page shows it', () => {
		expect(quietBannerHead([LINK], ['Prompt.js'], {})).toEqual([LINK]);
	});
});
