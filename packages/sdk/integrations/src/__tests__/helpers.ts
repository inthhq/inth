import type {
	ConsentState,
	Script,
	ScriptCallbackInfo,
} from '@inth/sdk/engine';
import { afterEach, beforeEach, expect, vi } from 'vitest';

import { getBuiltInScriptIntegration } from '../registry';
import type { BuiltInScriptIntegrationKey } from '../registry';

export type TestGlobal = typeof globalThis & Record<string, unknown>;

export interface HelperScriptSnapshot {
	id: string;
	category: unknown;
	alwaysLoad?: boolean;
	persistAfterConsentRevoked?: Script['persistAfterConsentRevoked'];
	src?: string;
	vendor?: string;
	vendorDetails?: {
		name: string;
		privacyPolicyUrl: string;
		homepageUrl?: string;
	};
}

export interface ExpectedScriptSnapshot {
	alwaysLoad: boolean | undefined;
	persistAfterConsentRevoked: Script['persistAfterConsentRevoked'];
	src: string | undefined;
}

export const deniedConsentState: ConsentState = {
	experience: false,
	functionality: false,
	marketing: false,
	measurement: false,
	necessary: true,
};

export const grantedMeasurementConsentState: ConsentState = {
	experience: false,
	functionality: false,
	marketing: false,
	measurement: true,
	necessary: true,
};

export type CallbackInfoOverrides = Partial<ScriptCallbackInfo> &
	Pick<ScriptCallbackInfo, 'id'>;

export const createCallbackInfo = function createCallbackInfo(
	overrides: CallbackInfoOverrides
): ScriptCallbackInfo {
	return {
		consents: deniedConsentState,
		elementId: overrides.id,
		hasConsent: false,
		...overrides,
	};
};

export type LifecycleCallbackOverrides = Partial<
	Omit<ScriptCallbackInfo, 'id'>
>;

export const runOnBeforeLoad = function runOnBeforeLoad(
	script: Pick<Script, 'id' | 'onBeforeLoad'>,
	overrides: LifecycleCallbackOverrides = {}
): void {
	script.onBeforeLoad?.(
		createCallbackInfo({
			id: script.id,
			...overrides,
		})
	);
};

export const getTestGlobal = function getTestGlobal(): TestGlobal {
	return globalThis as TestGlobal;
};

const cleanupMockBrowser = function cleanupMockBrowser() {
	const globalRef = getTestGlobal();
	vi.unstubAllGlobals();
	delete globalRef.dataLayer;
	delete globalRef.adobeDataLayer;
	delete globalRef.amplitude;
	delete globalRef._satellite;
	delete globalRef.gtag;
	delete globalRef._paq;
	delete globalRef.mixpanel;
	delete globalRef.analytics;
	delete globalRef.clarity;
	delete globalRef.heap;
	delete globalRef.heapReadyCb;
	delete globalRef.hj;
	delete globalRef._hjSettings;
	delete globalRef.posthog;
	delete globalRef.va;
	delete globalRef.vaq;
	delete globalRef.vam;
	delete globalRef.si;
	delete globalRef.siq;
	delete globalRef.sil;
	delete globalRef.$crisp;
	delete globalRef.CRISP_WEBSITE_ID;
	delete globalRef.CRISP_RUNTIME_CONFIG;
	delete globalRef.CRISP_COOKIE_DOMAIN;
	delete globalRef.CRISP_COOKIE_EXPIRE;
	delete globalRef.CRISP_TOKEN_ID;
	delete globalRef.Intercom;
	delete globalRef.intercomSettings;
	delete globalRef.databuddy;
	delete globalRef.databuddyConfig;
	delete globalRef.databuddyReplay;
	delete globalRef.plausible;
	delete globalRef.ttq;
	delete globalRef.snaptr;
	delete globalRef._snaptr;
	delete globalRef.pintrk;
	delete globalRef.rdt;
	delete globalRef.oaiq;
	delete globalRef.twq;
	delete globalRef._linkedin_partner_id;
	delete globalRef._linkedin_data_partner_ids;
	delete globalRef.uetq;
	delete globalRef.fbq;
	delete globalRef._fbq;
	delete globalRef.htevents;
	delete globalRef.rudderanalytics;
	delete globalRef.rudderAnalyticsBuildType;
	delete globalRef.RudderSnippetVersion;
};

const setupMockBrowser = function setupMockBrowser() {
	const globalRef = getTestGlobal();
	const scriptAnchor = {
		parentNode: {
			insertBefore: vi.fn((node: Record<string, unknown>) => node),
		},
	};

	const document = {
		createElement: vi.fn((_tag: string) => ({
			async: false,
			defer: false,
			setAttribute: vi.fn(),

			textContent: '',
		})),
		getElementsByTagName: vi.fn(() => [scriptAnchor]),
		head: {
			appendChild: vi.fn((node: Record<string, unknown>) => node),
		},
	};

	vi.stubGlobal('window', globalRef as unknown as Window & typeof globalThis);
	vi.stubGlobal('document', document as unknown as Document);
};

export const setupScriptHelperTest = function setupScriptHelperTest(): void {
	beforeEach(() => {
		setupMockBrowser();
	});

	afterEach(() => {
		cleanupMockBrowser();
	});
};

export const expectScriptMatchesIntegration =
	function expectScriptMatchesIntegration(
		key: BuiltInScriptIntegrationKey,
		script: HelperScriptSnapshot,
		expected: ExpectedScriptSnapshot
	): void {
		const matchedIntegration = getBuiltInScriptIntegration(key);

		expect(script.id, key).toBe(matchedIntegration.vendor);
		expect(script.category, key).toEqual(matchedIntegration.consentCategory);
		expect(script.alwaysLoad, key).toBe(expected.alwaysLoad);
		expect(script.persistAfterConsentRevoked, key).toBe(
			expected.persistAfterConsentRevoked
		);
		expect(script.src, key).toBe(expected.src);
		expect(script.vendor, key).toBe(matchedIntegration.vendor);
		// Every built-in helper names its vendor, so the dialog lists it with
		// its own switch instead of gating it on the category alone.
		expect(script.vendorDetails?.name, key).toBeTruthy();
		expect(script.vendorDetails?.privacyPolicyUrl, key).toMatch(/^https:\/\//u);
		if (script.vendorDetails?.homepageUrl !== undefined) {
			expect(script.vendorDetails.homepageUrl, key).toMatch(/^https:\/\//u);
		}
	};

/**
 * Asserts that a helper logs a configuration problem and returns a script that
 * never loads, instead of throwing.
 *
 * @param script - ID and category the skipped script should keep. Its
 * vendor slug defaults to the ID.
 * @param problem - Expected message, without the trailing
 * `. The script will not load.`
 */
export const expectSkippedScript = function expectSkippedScript(
	create: () => Script,
	script: Pick<Script, 'category' | 'id'> & Partial<Pick<Script, 'vendor'>>,
	problem: string
): void {
	const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	try {
		// The vendor stays declared, and listed by name, while the ID is missing.
		expect(create()).toEqual({
			callbackOnly: true,
			...script,
			vendor: script.vendor ?? script.id,
			vendorDetails: expect.objectContaining({ name: expect.any(String) }),
		});
		expect(error).toHaveBeenCalledOnce();
		expect(error).toHaveBeenCalledWith(`${problem}. The script will not load.`);
	} finally {
		error.mockRestore();
	}
};

export const toArgumentsArray = function toArgumentsArray(
	value: unknown
): unknown[] {
	return Array.prototype.slice.call(value);
};

export const expectGoogleConsentDefault = function expectGoogleConsentDefault(
	entry: unknown
): void {
	expect(toArgumentsArray(entry)).toEqual([
		'consent',
		'default',
		{
			ad_personalization: 'denied',
			ad_storage: 'denied',
			ad_user_data: 'denied',
			analytics_storage: 'denied',
			functionality_storage: 'denied',
			personalization_storage: 'denied',
			security_storage: 'granted',
		},
	]);
};

export const expectStubCommandQueue = function expectStubCommandQueue(
	stub: unknown,
	queueKey: string,
	commands: unknown[][]
): void {
	const queueOwner = stub as Record<string, unknown> | undefined;
	const actualQueue = Array.isArray(queueOwner?.[queueKey])
		? (queueOwner[queueKey] as unknown[]).map((command) =>
				toArgumentsArray(command)
			)
		: queueOwner?.[queueKey];
	expect(actualQueue).toEqual(
		commands.map((command) => toArgumentsArray(command))
	);
};
