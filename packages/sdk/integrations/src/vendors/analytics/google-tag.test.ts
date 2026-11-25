import { describe, expect, it } from 'vite-plus/test';

import {
	deniedConsentState,
	expectGoogleConsentDefault,
	getTestGlobal,
	grantedMeasurementConsentState,
	runOnBeforeLoad,
	setupScriptHelperTest,
	toArgumentsArray,
} from '../../__tests__/helpers';
import { gtag } from './google-tag';

describe('gtag', () => {
	setupScriptHelperTest();

	it('runs consent defaults before config calls', () => {
		const globalRef = getTestGlobal();
		const script = gtag({ category: 'measurement', id: 'G-ORDER' });
		globalRef.dataLayer = [];

		runOnBeforeLoad(script, {
			consents: deniedConsentState,
		});

		const dataLayer = globalRef.dataLayer as unknown[];
		expectGoogleConsentDefault(dataLayer[0]);
		expect(toArgumentsArray(dataLayer[1])[0]).toBe('js');
		expect(toArgumentsArray(dataLayer[2])).toEqual(['config', 'G-ORDER']);
		expect(document.head.appendChild).not.toHaveBeenCalled();
	});

	it('passes explicit analytics config after denied defaults', () => {
		const globalRef = getTestGlobal();
		const script = gtag({
			category: 'measurement',
			config: { send_page_view: false },
			id: 'G-CONFIG',
		});
		globalRef.dataLayer = [];
		runOnBeforeLoad(script, { consents: deniedConsentState });
		const queue = globalRef.dataLayer as unknown[];
		expectGoogleConsentDefault(queue[0]);
		expect(toArgumentsArray(queue[2])).toEqual([
			'config',
			'G-CONFIG',
			{ send_page_view: false },
		]);
	});

	it('preserves deprecated script overrides', () => {
		const script = gtag({
			category: 'measurement',
			id: 'G-OVERRIDE',
			script: {
				attributes: {
					'data-test': '1',
				},
				nonce: 'abc123',
				target: 'body',
			},
		});

		expect(script.nonce).toBe('abc123');
		expect(script.target).toBe('body');
		expect(script.attributes).toEqual({
			'data-test': '1',
		});
	});

	it('loads before a choice by default', () => {
		const script = gtag({ category: 'measurement', id: 'G-DEFAULT' });

		expect(script.alwaysLoad).toBe(true);
		expect(script.category).toBe('measurement');
		expect(script.persistAfterConsentRevoked).toBe(true);
		expect(script.src).toBe(
			'https://www.googletagmanager.com/gtag/js?id=G-DEFAULT'
		);
	});

	it('waits for its category with loadMode after-consent', () => {
		const script = gtag({
			category: 'marketing',
			id: 'G-GATED',
			loadMode: 'after-consent',
		});

		expect(script.alwaysLoad).toBeUndefined();
		expect(script.category).toBe('marketing');
		expect(script.persistAfterConsentRevoked).toBe(true);
		expect(script.src).toBe(
			'https://www.googletagmanager.com/gtag/js?id=G-GATED'
		);
	});

	it('sends the current permissions as the default before config when gated', () => {
		const globalRef = getTestGlobal();
		const script = gtag({
			category: 'measurement',
			id: 'G-GATED',
			loadMode: 'after-consent',
		});

		runOnBeforeLoad(script, {
			consents: grantedMeasurementConsentState,
			hasConsent: true,
		});

		const dataLayer = globalRef.dataLayer as unknown[];
		expect(toArgumentsArray(dataLayer[0])).toEqual([
			'consent',
			'default',
			expect.objectContaining({
				ad_storage: 'denied',
				analytics_storage: 'granted',
			}),
		]);
		expect(toArgumentsArray(dataLayer[1])[0]).toBe('js');
		expect(toArgumentsArray(dataLayer[2])).toEqual(['config', 'G-GATED']);
	});

	it('sends a custom consent mapping in the default command', () => {
		const globalRef = getTestGlobal();
		const script = gtag({
			category: 'marketing',
			consentMapping: { marketing: ['ad_storage'] },
			id: 'AW-MAPPED',
		});

		runOnBeforeLoad(script, { consents: deniedConsentState });

		const dataLayer = globalRef.dataLayer as unknown[];
		expect(toArgumentsArray(dataLayer[0])).toEqual([
			'consent',
			'default',
			{ ad_storage: 'denied' },
		]);
	});

	it('keeps explicit config when it waits for consent', () => {
		const globalRef = getTestGlobal();
		const script = gtag({
			category: 'marketing',
			config: { allow_enhanced_conversions: true },
			id: 'AW-GATED',
			loadMode: 'after-consent',
		});

		expect(script.alwaysLoad).toBeUndefined();
		expect(script.category).toBe('marketing');
		expect(script.persistAfterConsentRevoked).toBe(true);

		runOnBeforeLoad(script, { consents: deniedConsentState });
		expect(toArgumentsArray((globalRef.dataLayer as unknown[])[2])).toEqual([
			'config',
			'AW-GATED',
			{ allow_enhanced_conversions: true },
		]);
	});

	it('applies deprecated script overrides over the load mode', () => {
		const script = gtag({
			category: 'measurement',
			id: 'G-OVERRIDE',
			loadMode: 'after-consent',
			script: { alwaysLoad: true, nonce: 'abc123' },
		});

		expect(script.alwaysLoad).toBe(true);
		expect(script.nonce).toBe('abc123');
		expect(script.src).toBe(
			'https://www.googletagmanager.com/gtag/js?id=G-OVERRIDE'
		);
	});
});
