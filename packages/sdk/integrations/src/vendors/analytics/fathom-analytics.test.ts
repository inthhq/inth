import { describe, expect, it } from 'vite-plus/test';

import {
	expectScriptMatchesIntegration,
	setupScriptHelperTest,
} from '../../__tests__/helpers';
import { fathomAnalytics } from './fathom-analytics';

describe('fathomAnalytics', () => {
	setupScriptHelperTest();

	it('matches registry metadata with the default loader', () => {
		const script = fathomAnalytics({ site: 'SITE123' });

		expectScriptMatchesIntegration('fathomAnalytics', script, {
			alwaysLoad: undefined,
			persistAfterConsentRevoked: undefined,
			src: 'https://cdn.usefathom.com/script.js',
		});
		expect(script.attributes).toEqual({
			'data-auto': undefined,
			'data-canonical': undefined,
			'data-honor-dnt': undefined,
			'data-site': 'SITE123',
			'data-spa': undefined,
		});
	});

	it('serializes boolean options as "true" / "false" strings', () => {
		const script = fathomAnalytics({
			auto: false,
			canonical: false,
			honorDnt: true,
			site: 'SITE123',
			spa: 'history',
		});

		expect(script.attributes).toEqual({
			'data-auto': 'false',
			'data-canonical': 'false',
			'data-honor-dnt': 'true',
			'data-site': 'SITE123',
			'data-spa': 'history',
		});
	});

	it("leaves out Fathom's own defaults, so passing one matches leaving it unset", () => {
		const script = fathomAnalytics({
			auto: true,
			canonical: true,
			honorDnt: false,
			site: 'SITE123',
			spa: 'off',
		});

		expect(script.attributes).toEqual({ 'data-site': 'SITE123' });
		expect(script.attributes).toEqual(
			fathomAnalytics({ site: 'SITE123' }).attributes
		);
	});

	it('honors a custom loader URL', () => {
		const script = fathomAnalytics({
			scriptUrl: 'https://cdn.example.com/fathom.js',
			site: 'SITE123',
		});

		expect(script.src).toBe('https://cdn.example.com/fathom.js');
	});
});
