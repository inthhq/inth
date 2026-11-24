import { describe, expect, it } from 'vite-plus/test';

import {
	expectScriptMatchesIntegration,
	expectSkippedScript,
	setupScriptHelperTest,
} from '../../__tests__/helpers';
import { clay } from './clay';

describe('clay', () => {
	setupScriptHelperTest();
	it('matches registry metadata and the official loader URL', () => {
		expectScriptMatchesIntegration('clay', clay({ siteId: 'inthfake' }), {
			alwaysLoad: undefined,
			persistAfterConsentRevoked: true,
			src: 'https://static.claydar.com/init.v1.js?id=inthfake',
		});
	});
	it('skips invalid required IDs', () => {
		for (const id of ['', ' ', 42, undefined, null, {}]) {
			expectSkippedScript(
				() => clay({ siteId: id as string }),
				{ category: 'marketing', id: 'clay' },
				'clay: missing or invalid siteId'
			);
		}
	});
	it('uses custom URLs and falls back for blank overrides', () => {
		expect(
			clay({
				...{ siteId: 'inthfake' },
				scriptUrl: 'https://cdn.example.com/vendor.js',
			}).src
		).toBe('https://cdn.example.com/vendor.js');
		expect(clay({ ...{ siteId: 'inthfake' }, scriptUrl: '   ' }).src).toBe(
			'https://static.claydar.com/init.v1.js?id=inthfake'
		);
	});
});

it('trims and encodes the site ID', () => {
	expect(clay({ siteId: ' a/b?c ' }).src).toBe(
		'https://static.claydar.com/init.v1.js?id=a%2Fb%3Fc'
	);
});
