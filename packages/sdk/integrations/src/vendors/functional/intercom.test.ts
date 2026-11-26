import { describe, expect, it } from 'vite-plus/test';

import {
	createCallbackInfo,
	expectScriptMatchesIntegration,
	getTestGlobal,
	setupScriptHelperTest,
} from '../../__tests__/helpers';
import { intercom } from './intercom';

type IntercomStub = ((...args: unknown[]) => void) & {
	q?: unknown[][];
};

describe('intercom', () => {
	setupScriptHelperTest();

	it('matches registry metadata with the default widget URL', () => {
		const script = intercom({ appId: 'abc123' });

		expectScriptMatchesIntegration('intercom', script, {
			alwaysLoad: undefined,
			persistAfterConsentRevoked: undefined,
			src: 'https://widget.intercom.io/widget/abc123',
		});
	});

	it.each([
		['us', 'https://api-iam.intercom.io'],
		['eu', 'https://api-iam.eu.intercom.io'],
		['au', 'https://api-iam.au.intercom.io'],
	] as const)('uses the %s API base for the region', (region, apiBase) => {
		const script = intercom({ appId: 'abc123', region });

		script.onBeforeLoad?.(createCallbackInfo({ id: script.id }));

		expect(getTestGlobal().intercomSettings).toEqual({
			api_base: apiBase,
			app_id: 'abc123',
		});
	});

	it('prefers apiBase over region', () => {
		const script = intercom({
			apiBase: 'https://api-iam.example.test',
			appId: 'abc123',
			region: 'eu',
		});

		script.onBeforeLoad?.(createCallbackInfo({ id: script.id }));

		expect(getTestGlobal().intercomSettings).toMatchObject({
			api_base: 'https://api-iam.example.test',
		});
	});

	it('sets Intercom settings and queues calls before loading the widget', () => {
		const globalRef = getTestGlobal();
		const script = intercom({
			appId: 'abc123',
			settings: {
				company: {
					company_id: 'company-123',
					name: 'Example Company Inc.',
				},
				name: 'Ada Lovelace',
				user_id: 'user-123',
			},
		});

		script.onBeforeLoad?.(
			createCallbackInfo({
				id: script.id,
			})
		);

		expect(globalRef.intercomSettings).toEqual({
			api_base: 'https://api-iam.intercom.io',
			app_id: 'abc123',
			company: {
				company_id: 'company-123',
				name: 'Example Company Inc.',
			},
			name: 'Ada Lovelace',
			user_id: 'user-123',
		});

		const intercomStub = globalRef.Intercom as IntercomStub;
		intercomStub('boot', { app_id: 'abc123' });

		expect(intercomStub.q).toEqual([['boot', { app_id: 'abc123' }]]);
	});

	it('keeps the explicit app ID authoritative over custom settings', () => {
		const globalRef = getTestGlobal();
		const script = intercom({
			appId: 'abc123',
			settings: {
				api_base: 'https://api-iam.au.intercom.io',
				app_id: 'ignored',
			},
		});

		script.onBeforeLoad?.(
			createCallbackInfo({
				id: script.id,
			})
		);

		expect(globalRef.intercomSettings).toEqual({
			api_base: 'https://api-iam.intercom.io',
			app_id: 'abc123',
		});
	});

	it('supports Intercom regional API bases', () => {
		const globalRef = getTestGlobal();
		const script = intercom({
			apiBase: 'https://api-iam.eu.intercom.io',
			appId: 'abc123',
		});

		script.onBeforeLoad?.(
			createCallbackInfo({
				id: script.id,
			})
		);

		expect(globalRef.intercomSettings).toEqual({
			api_base: 'https://api-iam.eu.intercom.io',
			app_id: 'abc123',
		});
	});

	it('supports overriding the widget URL', () => {
		const script = intercom({
			appId: 'abc123',
			scriptSrc: 'https://cdn.example.com/intercom.js',
		});

		expect(script.src).toBe('https://cdn.example.com/intercom.js');
	});
});
