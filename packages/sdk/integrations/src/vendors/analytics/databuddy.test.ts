import { describe, expect, it, vi } from 'vite-plus/test';

import {
	createCallbackInfo,
	deniedConsentState,
	getTestGlobal,
	grantedMeasurementConsentState,
	setupScriptHelperTest,
} from '../../__tests__/helpers';
import { resolveManifest } from '../../resolve';
import { databuddy, databuddyManifest } from './databuddy';

/** The `databuddy.js` hash of release 2026-10-30.1, checked against cdn.databuddy.cc. */
const PINNED_INTEGRITY =
	'sha384-xXKfqQUu53gQi7i1OUzZ1t/rlpkyILPqMsDxO4MQH70gAX/yiDVUj1JogQaW0M2s';

describe('databuddy', () => {
	setupScriptHelperTest();

	it('resolves the exported manifest from the same config as before version', () => {
		const script = resolveManifest(databuddyManifest, {
			apiUrl: 'https://basket.databuddy.cc',
			clientId: 'db_123',
			configWhenGranted: { clientId: 'db_123', disabled: false },
			scriptUrl: 'https://cdn.databuddy.cc/databuddy.js',
			trackErrors: undefined,
			trackInteractions: undefined,
			trackOutgoingLinks: undefined,
			trackWebVitals: undefined,
		});

		expect(script.src).toBe('https://cdn.databuddy.cc/databuddy.js');
		expect(script.attributes).not.toHaveProperty('integrity');
	});

	it('waits for measurement consent by default', () => {
		const script = databuddy({ clientId: 'db_123' });

		expect(script.alwaysLoad).toBeUndefined();
		expect(script.category).toBe('measurement');
		expect(script.src).toBe('https://cdn.databuddy.cc/databuddy.js');
	});

	it('seeds the client ID, API URL and disabled flag when no configs are passed', () => {
		const globalRef = getTestGlobal();
		const script = databuddy({ clientId: 'db_123', loadMode: 'always' });

		script.onBeforeLoad?.(
			createCallbackInfo({
				consents: deniedConsentState,
				id: script.id,
			})
		);
		expect(globalRef.databuddyConfig).toEqual({
			apiUrl: 'https://basket.databuddy.cc',
			clientId: 'db_123',
			disabled: true,
		});

		script.onConsentChange?.(
			createCallbackInfo({
				consents: grantedMeasurementConsentState,
				hasConsent: true,
				id: script.id,
			})
		);
		expect(globalRef.databuddyConfig).toEqual({
			apiUrl: 'https://basket.databuddy.cc',
			clientId: 'db_123',
			disabled: false,
		});
	});

	it('sets the config disabled key from consent when always loaded', () => {
		const globalRef = getTestGlobal();
		const script = databuddy({
			clientId: 'db_123',
			configWhenDenied: { clientId: 'db_123' },
			configWhenGranted: { clientId: 'db_123', disabled: true },
			loadMode: 'always',
		});

		script.onBeforeLoad?.(
			createCallbackInfo({
				consents: deniedConsentState,
				id: script.id,
			})
		);
		// databuddy.js reads this as it starts, before onLoad disables it.
		expect(globalRef.databuddyConfig).toEqual({
			clientId: 'db_123',
			disabled: true,
		});

		script.onConsentChange?.(
			createCallbackInfo({
				consents: grantedMeasurementConsentState,
				hasConsent: true,
				id: script.id,
			})
		);
		expect(globalRef.databuddyConfig).toEqual({
			clientId: 'db_123',
			disabled: false,
		});
	});

	it('sets a data attribute for each feature switch', () => {
		const script = databuddy({
			clientId: 'db_123',
			features: {
				errors: true,
				interactions: false,
				outgoingLinks: true,
				webVitals: false,
			},
		});

		expect(script.attributes).toEqual({
			crossorigin: 'anonymous',
			'data-api-url': 'https://basket.databuddy.cc',
			'data-client-id': 'db_123',
			'data-track-errors': 'true',
			'data-track-interactions': 'false',
			'data-track-outgoing-links': 'true',
			'data-track-web-vitals': 'false',
		});
	});

	it('preserves config seeding and sync behavior when always loaded', () => {
		const globalRef = getTestGlobal();
		const script = databuddy({
			apiUrl: 'https://basket.databuddy.cc',
			clientId: 'db_123',
			configWhenDenied: {
				apiUrl: 'https://basket.databuddy.cc',
				clientId: 'db_123',
				disabled: true,
				trackScreenViews: true,
			},
			configWhenGranted: {
				apiUrl: 'https://basket.databuddy.cc',
				clientId: 'db_123',
				disabled: false,
				trackScreenViews: true,
			},
			loadMode: 'always',
		});

		expect(script.alwaysLoad).toBe(true);
		expect(script.src).toBe('https://cdn.databuddy.cc/databuddy.js');
		expect(script.attributes).toEqual({
			crossorigin: 'anonymous',
			'data-api-url': 'https://basket.databuddy.cc',
			'data-client-id': 'db_123',
		});

		script.onBeforeLoad?.(
			createCallbackInfo({
				consents: deniedConsentState,
				id: script.id,
			})
		);

		expect(globalRef.databuddyConfig).toEqual({
			apiUrl: 'https://basket.databuddy.cc',
			clientId: 'db_123',
			disabled: true,
			trackScreenViews: true,
		});

		globalRef.databuddy = {
			clear: vi.fn(),
			flush: vi.fn(),
			options: {
				disabled: true,
			},
			screenView: vi.fn(),
			setGlobalProperties: vi.fn(),
			track: vi.fn(),
			trackCustomEvent: vi.fn(),
		};

		script.onLoad?.(
			createCallbackInfo({
				consents: grantedMeasurementConsentState,
				hasConsent: true,
				id: script.id,
			})
		);

		expect(
			(globalRef.databuddy as { options: { disabled: boolean } }).options
				.disabled
		).toBe(false);

		script.onConsentChange?.(
			createCallbackInfo({
				consents: deniedConsentState,
				id: script.id,
			})
		);

		expect(
			(globalRef.databuddy as { options: { disabled: boolean } }).options
				.disabled
		).toBe(true);
		expect(globalRef.databuddyConfig).toEqual({
			apiUrl: 'https://basket.databuddy.cc',
			clientId: 'db_123',
			disabled: true,
			trackScreenViews: true,
		});

		script.onConsentChange?.(
			createCallbackInfo({
				consents: grantedMeasurementConsentState,
				hasConsent: true,
				id: script.id,
			})
		);

		expect(globalRef.databuddyConfig).toEqual({
			apiUrl: 'https://basket.databuddy.cc',
			clientId: 'db_123',
			disabled: false,
			trackScreenViews: true,
		});
		expect(
			(globalRef.databuddy as { options: { disabled: boolean } }).options
				.disabled
		).toEqual(false);
	});

	it('loads the unversioned file without integrity by default', () => {
		const script = databuddy({ clientId: 'db_123' });

		expect(script.src).toBe('https://cdn.databuddy.cc/databuddy.js');
		expect(script.attributes).not.toHaveProperty('integrity');
	});

	it('reads a blank version as unset', () => {
		const script = databuddy({ clientId: 'db_123', version: '  ' });

		expect(script.src).toBe('https://cdn.databuddy.cc/databuddy.js');
		expect(script.attributes).not.toHaveProperty('integrity');
	});

	it('pins a release it knows with its integrity', () => {
		const script = databuddy({ clientId: 'db_123', version: '2026-10-30.1' });

		expect(script.src).toBe(
			'https://cdn.databuddy.cc/databuddy.2026-10-30.1.js'
		);
		expect(script.attributes?.integrity).toBe(PINNED_INTEGRITY);
		expect(script.attributes?.crossorigin).toBe('anonymous');
	});

	it('pins another release without integrity', () => {
		const script = databuddy({ clientId: 'db_123', version: ' 2026-11-14.1 ' });

		expect(script.src).toBe(
			'https://cdn.databuddy.cc/databuddy.2026-11-14.1.js'
		);
		expect(script.attributes).not.toHaveProperty('integrity');
	});

	it('loads a scriptUrl over version, without integrity', () => {
		const script = databuddy({
			clientId: 'db_123',
			scriptUrl: 'https://proxy.example/databuddy.js',
			version: '2026-10-30.1',
		});

		expect(script.src).toBe('https://proxy.example/databuddy.js');
		expect(script.attributes).not.toHaveProperty('integrity');
	});

	it('disposes replay during server rendering', () => {
		const script = databuddy({ clientId: 'db_123', replay: true });
		vi.stubGlobal('window', undefined);

		expect(script.onDispose).toBeTypeOf('function');
		expect(() =>
			script.onDispose?.(createCallbackInfo({ id: script.id }))
		).not.toThrow();
	});
});
