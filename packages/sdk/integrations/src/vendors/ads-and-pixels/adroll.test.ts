import { describe, expect, it } from 'vitest';

import {
	expectScriptMatchesIntegration,
	expectSkippedScript,
	setupScriptHelperTest,
} from '../../__tests__/helpers';
import { adrollPixel } from './adroll';

describe('adrollPixel', () => {
	setupScriptHelperTest();
	it('matches registry metadata and the official loader URL', () => {
		expectScriptMatchesIntegration(
			'adrollPixel',
			adrollPixel({ advertiserId: 'inthfake', pixelId: 'inthfake' }),
			{
				alwaysLoad: undefined,
				persistAfterConsentRevoked: true,
				src: 'https://s.adroll.com/j/inthfake/roundtrip.js',
			}
		);
	});
	it('skips invalid required IDs', () => {
		for (const id of ['', ' ', undefined, null, {}]) {
			expectSkippedScript(
				() => adrollPixel({ advertiserId: id as string, pixelId: 'inthfake' }),
				{ category: 'marketing', id: 'adroll' },
				'adrollPixel: missing or invalid advertiserId'
			);
		}
	});
	it('uses custom URLs and falls back for blank overrides', () => {
		expect(
			adrollPixel({
				...{ advertiserId: 'inthfake', pixelId: 'inthfake' },
				scriptUrl: 'https://cdn.example.com/vendor.js',
			}).src
		).toBe('https://cdn.example.com/vendor.js');
		expect(
			adrollPixel({
				...{ advertiserId: 'inthfake', pixelId: 'inthfake' },
				scriptUrl: '   ',
			}).src
		).toBe('https://s.adroll.com/j/inthfake/roundtrip.js');
	});
});
