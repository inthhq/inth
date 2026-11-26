import { describe, expect, it } from 'vite-plus/test';

import {
	expectScriptMatchesIntegration,
	expectSkippedScript,
	getTestGlobal,
	runOnBeforeLoad,
	setupScriptHelperTest,
} from '../../__tests__/helpers';
import { adobeAnalytics } from './adobe-analytics';

describe('adobeAnalytics', () => {
	setupScriptHelperTest();

	it('matches registry metadata with the Adobe Tags embed URL', () => {
		const script = adobeAnalytics({
			scriptUrl:
				'https://assets.adobedtm.com/inthfake/inthfake/launch-inthfake.min.js',
		});

		expectScriptMatchesIntegration('adobeAnalytics', script, {
			alwaysLoad: undefined,
			persistAfterConsentRevoked: undefined,
			src: 'https://assets.adobedtm.com/inthfake/inthfake/launch-inthfake.min.js',
		});
		expect(script.async).toBe(true);
	});

	it('trims the script URL before loading', () => {
		const script = adobeAnalytics({
			scriptUrl:
				' https://assets.adobedtm.com/inthfake/inthfake/launch-inthfake.min.js ',
		});

		expect(script.src).toBe(
			'https://assets.adobedtm.com/inthfake/inthfake/launch-inthfake.min.js'
		);
	});

	it('builds the Adobe-hosted embed URL from trimmed embed IDs', () => {
		const script = adobeAnalytics({
			companyId: ' a7d65461e54e ',
			environmentId: 'f3a2b1c0d9e8-staging',
			propertyId: '01d650ac6ffb',
		});

		expect(script.src).toBe(
			'https://assets.adobedtm.com/a7d65461e54e/01d650ac6ffb/launch-f3a2b1c0d9e8-staging.min.js'
		);
	});

	it('prefers scriptUrl over embed IDs', () => {
		const script = adobeAnalytics({
			companyId: 'a7d65461e54e',
			environmentId: 'f3a2b1c0d9e8',
			propertyId: '01d650ac6ffb',
			scriptUrl: 'https://tags.example.com/launch.min.js',
		});

		expect(script.src).toBe('https://tags.example.com/launch.min.js');
	});

	it('skips when an embed ID is blank', () => {
		expectSkippedScript(
			() =>
				adobeAnalytics({
					companyId: 'a7d65461e54e',
					environmentId: ' ',
					propertyId: '01d650ac6ffb',
				}),
			{ category: 'measurement', id: 'adobe-analytics' },
			'adobeAnalytics: missing or invalid scriptUrl'
		);
	});

	it('supports synchronous deployment', () => {
		const script = adobeAnalytics({
			async: false,
			scriptUrl:
				'https://assets.adobedtm.com/inthfake/inthfake/launch-inthfake.min.js',
		});

		expect(script.async).toBe(false);
	});

	it('seeds adobeDataLayer before loading by default', () => {
		const script = adobeAnalytics({
			scriptUrl:
				'https://assets.adobedtm.com/inthfake/inthfake/launch-inthfake.min.js',
		});
		const globalRef = getTestGlobal();

		runOnBeforeLoad(script);

		expect(globalRef.adobeDataLayer).toEqual([]);
	});

	it('does not replace an existing adobeDataLayer', () => {
		const script = adobeAnalytics({
			scriptUrl:
				'https://assets.adobedtm.com/inthfake/inthfake/launch-inthfake.min.js',
		});
		const globalRef = getTestGlobal();
		const existingQueue = [{ event: 'pageView' }];
		globalRef.adobeDataLayer = existingQueue;

		runOnBeforeLoad(script);

		expect(globalRef.adobeDataLayer).toBe(existingQueue);
	});

	it('allows data layer seeding to be disabled', () => {
		const script = adobeAnalytics({
			scriptUrl:
				'https://assets.adobedtm.com/inthfake/inthfake/launch-inthfake.min.js',
			seedAdobeDataLayer: false,
		});
		const globalRef = getTestGlobal();

		runOnBeforeLoad(script);

		expect(globalRef.adobeDataLayer).toBeUndefined();
	});

	it('logs and skips the script for an empty scriptUrl', () => {
		expectSkippedScript(
			() => adobeAnalytics({ scriptUrl: '   ' }),
			{ category: 'measurement', id: 'adobe-analytics' },
			'adobeAnalytics: missing or invalid scriptUrl'
		);
	});

	it('logs and skips the script for a non-https scriptUrl', () => {
		expectSkippedScript(
			() =>
				adobeAnalytics({
					scriptUrl: 'http://assets.adobedtm.com/inthfake/launch.min.js',
				}),
			{ category: 'measurement', id: 'adobe-analytics' },
			'adobeAnalytics: invalid scriptUrl - must use https: from your Adobe Data Collection embed code'
		);
	});
});
