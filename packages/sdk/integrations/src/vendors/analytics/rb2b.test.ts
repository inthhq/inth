import { describe, expect, it } from 'vitest';

import {
	expectScriptMatchesIntegration,
	expectSkippedScript,
	setupScriptHelperTest,
} from '../../__tests__/helpers';
import { rb2b } from './rb2b';

describe('rb2b', () => {
	setupScriptHelperTest();
	it('matches registry metadata and the official loader URL', () => {
		expectScriptMatchesIntegration('rb2b', rb2b({ accountKey: 'inthfake' }), {
			alwaysLoad: undefined,
			persistAfterConsentRevoked: true,
			src: 'https://ddwl4m2hdecbv.cloudfront.net/b/inthfake/inthfake.js.gz',
		});
	});
	it('skips invalid required IDs', () => {
		for (const id of ['', ' ', undefined, null, {}, 42]) {
			expectSkippedScript(
				() => rb2b({ accountKey: id as string }),
				{ category: 'marketing', id: 'rb2b' },
				'rb2b: missing or invalid accountKey'
			);
		}
	});
	it.each([
		'https://ddwl4m2hdecbv.cloudfront.net/b/inthfake/custom.js?cache=1#loader',
		'https://s3-us-west-2.amazonaws.com/b2bjsstore/b/inthfake/reb2b.js.gz',
		'https://b2bjsstore.s3.us-west-2.amazonaws.com/b/inthfake/reb2b.js.gz',
		'https://DDWL4M2HDECBV.CLOUDFRONT.NET:443/b/inthfake/reb2b.js.gz',
		'https://ddwl4m2hdecbv.cloudfront.net/b/other/../inthfake/custom.js?next=/b/OTHER/#loader',
	])('accepts a vendor-supported source: %s', (scriptUrl) => {
		expect(rb2b({ accountKey: 'inthfake', scriptUrl }).src).toBe(scriptUrl);
	});
	describe.each([
		'https://ddwl4m2hdecbv.cloudfront.net/b/',
		'https://s3-us-west-2.amazonaws.com/b2bjsstore/b/',
		'https://b2bjsstore.s3.us-west-2.amazonaws.com/b/',
	])('account path under %s', (prefix) => {
		it.each([
			'inthfake/',
			'inthfake/?file=loader.js',
			'inthfake/#loader.js',
			'inthfake/?file=loader.js#loader.js',
			'inthfake//',
			'inthfake/nested/',
			'inthfake/nested/?file=loader.js#loader.js',
			'inthfake/./',
			'inthfake/loader/..',
			'%6315tfake/',
		])('skips an account path without a script filename: %s', (suffix) => {
			expectSkippedScript(
				() => rb2b({ accountKey: 'inthfake', scriptUrl: `${prefix}${suffix}` }),
				{ category: 'marketing', id: 'rb2b' },
				'rb2b: scriptUrl must use a supported HTTPS CloudFront or S3 prefix and /b/<accountKey>/<filename> path'
			);
		});
		it('skips an encoded account directory without a script filename', () => {
			expectSkippedScript(
				() => rb2b({ accountKey: 'a/b?c', scriptUrl: `${prefix}a%2fb%3fc/` }),
				{ category: 'marketing', id: 'rb2b' },
				'rb2b: scriptUrl must use a supported HTTPS CloudFront or S3 prefix and /b/<accountKey>/<filename> path'
			);
		});
		it.each([
			'loader',
			'loader.custom?cache=1#loader',
			'nested/loader?cache=1#loader',
		])(
			'accepts a script filename without extension restrictions: %s',
			(filename) => {
				const scriptUrl = `${prefix}inthfake/${filename}`;
				expect(rb2b({ accountKey: 'inthfake', scriptUrl }).src).toBe(scriptUrl);
			}
		);
		it.each([
			'OTHER/OTHER.js.gz?next=/b/inthfake/',
			'OTHER/OTHER.js.gz#next=/b/inthfake/',
			'OTHER/b/inthfake/custom.js',
			'inthfake?next=/b/inthfake/',
			'INTHFAKE/custom.js',
			'%4315tfake/custom.js',
			'inthfake-extra/custom.js',
			'inthfake%2Fextra/custom.js',
			'inthfake%/custom.js',
			'inthfake%GG/custom.js',
			'inthfake%C3%28/custom.js',
		])('skips a misplaced account match: %s', (suffix) => {
			expectSkippedScript(
				() => rb2b({ accountKey: 'inthfake', scriptUrl: `${prefix}${suffix}` }),
				{ category: 'marketing', id: 'rb2b' },
				'rb2b: scriptUrl must use a supported HTTPS CloudFront or S3 prefix and /b/<accountKey>/<filename> path'
			);
		});
		it('accepts the encoded account with a custom filename and URL metadata', () => {
			const scriptUrl = `${prefix}a%2fb%3fc/custom.js?next=/b/OTHER/#loader`;
			expect(rb2b({ accountKey: ' a/b?c ', scriptUrl }).src).toBe(scriptUrl);
		});
		it.each([
			['INTHFAKE', 'INTHFAKE'],
			['inthfake', '%6315tfake'],
			['a/b?c', '%61%2Fb%3Fc'],
			['a/b?c', 'a%2fb%3fc'],
			['a%2Fb', 'a%252Fb'],
			['a%b', 'a%25b'],
			['a%GG', 'a%25GG'],
			['a+b', 'a+b'],
			['a+b', 'a%2Bb'],
		])('accepts exact account %s encoded as %s', (accountKey, segment) => {
			const scriptUrl = `${prefix}${segment}/custom.js`;
			expect(rb2b({ accountKey, scriptUrl }).src).toBe(scriptUrl);
		});
		it.each([
			['INTHFAKE', 'inthfake'],
			['a/b?c', 'A%2fb%3fc'],
			['a%2Fb', 'a%252fb'],
			['a%2Fb', 'a%2Fb'],
			['a/b', 'a%252Fb'],
			['a%b', 'a%b'],
			['a%GG', 'a%GG'],
			['a b', 'a+b'],
		])('skips account %s mismatched as %s', (accountKey, segment) => {
			expectSkippedScript(
				() => rb2b({ accountKey, scriptUrl: `${prefix}${segment}/custom.js` }),
				{ category: 'marketing', id: 'rb2b' },
				'rb2b: scriptUrl must use a supported HTTPS CloudFront or S3 prefix and /b/<accountKey>/<filename> path'
			);
		});
	});
	it('falls back for blank overrides', () => {
		expect(rb2b({ accountKey: 'inthfake', scriptUrl: '   ' }).src).toBe(
			'https://ddwl4m2hdecbv.cloudfront.net/b/inthfake/inthfake.js.gz'
		);
	});
	it.each([
		'https://cdn.example.com/vendor.js',
		'https://ddwl4m2hdecbv.cloudfront.net/b/anotherfake/reb2b.js.gz',
		'https://s3-us-west-2.amazonaws.com/anotherbucket/b/inthfake/reb2b.js.gz',
		'https://ddwl4m2hdecbv.cloudfront.net/b/inthfake',
		'https://ddwl4m2hdecbv.cloudfront.net.example.com/b/inthfake/reb2b.js.gz',
		'https://user:password@ddwl4m2hdecbv.cloudfront.net/b/inthfake/reb2b.js.gz',
		'http://ddwl4m2hdecbv.cloudfront.net/b/inthfake/reb2b.js.gz',
		'/b/inthfake/reb2b.js.gz',
		'not a URL',
	])('skips unsupported SDK sources: %s', (scriptUrl) => {
		expectSkippedScript(
			() => rb2b({ accountKey: 'inthfake', scriptUrl }),
			{ category: 'marketing', id: 'rb2b' },
			'rb2b: scriptUrl must use a supported HTTPS CloudFront or S3 prefix and /b/<accountKey>/<filename> path'
		);
	});
});

it('encodes the trimmed key in both path segments', () => {
	expect(rb2b({ accountKey: ' a/b?c ' }).src).toBe(
		'https://ddwl4m2hdecbv.cloudfront.net/b/a%2Fb%3Fc/a%2Fb%3Fc.js.gz'
	);
});
