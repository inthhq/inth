/** @vitest-environment jsdom */
/**
 * Runs the canonical native document-start script (the one the Swift,
 * Kotlin and React Native helpers inject) in a fresh jsdom window, then
 * reads it with `webViewConsentSource()`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

import { afterEach, expect, test, vi } from 'vitest';

import { transportMode } from '../../__tests__/fixtures/transport-mode';
import { createOfflineTransport } from '../../transports/offline';
import { createConsentRuntime } from '../index';
import { webViewConsentSource } from '../webview-consent-source';

const scriptPath = (name: string) =>
	resolve(__dirname, '../../../../../native-protocol/webview', name);
const DOCUMENT_START = readFileSync(scriptPath('document-start.js'), 'utf8');
const UPDATE = readFileSync(scriptPath('update.js'), 'utf8');

const ORIGIN = 'https://app.example';
const TOKEN = 'b3f1c0de4a5e6f708192a3b4c5d6e7f8';
const KEY = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';

const nativeState = (overrides: Record<string, unknown> = {}) => ({
	gppString: null,
	model: 'opt-in',
	permissions: {
		experience: false,
		functionality: true,
		marketing: false,
		measurement: true,
		necessary: true,
	},
	ready: true,
	revision: 4,
	tcString: null,
	version: 1,
	...overrides,
});

const call = (source: string, ...args: unknown[]) =>
	`${source.trim().replace(/;$/u, '')}(${args.map((arg) => JSON.stringify(arg)).join(',')});`;

/**
 * A fresh top-level realm at `origin`, as a WebView page would be. The
 * injected object is non-configurable, so every test needs its own realm.
 */
const openWindow = (origin = ORIGIN) => {
	const context = createContext({});
	runInContext(
		`globalThis.window = globalThis; globalThis.top = globalThis;
		globalThis.location = Object.freeze({ origin: ${JSON.stringify(origin)} });`,
		context
	);
	const page = runInContext('globalThis', context) as Record<
		string,
		unknown
	> & { eval: (code: string) => unknown };
	page.eval = (code: string) => runInContext(code, context);
	vi.stubGlobal('window', page);
	return page;
};

afterEach(() => {
	vi.unstubAllGlobals();
});

test('outside a WebView there is no source, so inth runs as usual', () => {
	openWindow();
	expect(webViewConsentSource()).toBeUndefined();
});

test('a plain global assignment is not the native object', () => {
	const page = openWindow();
	Object.assign(page, {
		__c15tNativeConsent: Object.freeze({
			getState: () => nativeState(),
			openPreferences: () => true,
			subscribe: () => () => {},
			version: 1,
		}),
	});
	expect(webViewConsentSource()).toBeUndefined();
});

test('reads the native decision on a listed origin', () => {
	const page = openWindow();
	page.eval(
		call(
			DOCUMENT_START,
			[ORIGIN],
			TOKEN,
			KEY,
			nativeState({ model: 'iab', tcString: 'CQ-test' })
		)
	);
	const source = webViewConsentSource();
	expect(source?.getPermissions()).toEqual({
		experience: false,
		functionality: true,
		marketing: false,
		measurement: true,
		necessary: true,
	});
	expect(source?.getState()).toMatchObject({
		gppString: null,
		model: 'iab',
		revision: 4,
		tcString: 'CQ-test',
	});
});

test('injects nothing on an origin the app did not list', () => {
	const page = openWindow('https://other.example');
	page.eval(call(DOCUMENT_START, [ORIGIN], TOKEN, KEY, nativeState()));
	expect('__c15tNativeConsent' in page).toBe(false);
	expect(webViewConsentSource()).toBeUndefined();
});

test('a page script cannot replace the injected object', () => {
	const page = openWindow();
	page.eval(call(DOCUMENT_START, [ORIGIN], TOKEN, KEY, nativeState()));
	expect(() =>
		page.eval(
			"'use strict'; window.__c15tNativeConsent = { version: 1, getState() { return {}; } };"
		)
	).toThrow();
	expect(() =>
		page.eval(
			"Object.defineProperty(window, '__c15tNativeConsent', { value: {} });"
		)
	).toThrow();
	expect(webViewConsentSource()?.getState()?.revision).toBe(4);
});

test('only the native token can change the state', () => {
	const page = openWindow();
	page.eval(
		call(DOCUMENT_START, [ORIGIN], TOKEN, KEY, nativeState({ ready: false }))
	);
	const source = webViewConsentSource();
	const listener = vi.fn();
	source?.subscribe(listener);

	// Not ready: every optional category is denied.
	expect(source?.getPermissions()).toBeNull();

	const forged = nativeState({
		permissions: { marketing: true, measurement: true },
		revision: 99,
	});
	expect(page.eval(call(UPDATE, [ORIGIN], 'guess', forged))).toBe(false);
	expect(
		page.eval(
			`window.__c15tNativeConsent.update('guess', ${JSON.stringify(forged)})`
		)
	).toBe(false);
	expect(listener).not.toHaveBeenCalled();
	expect(source?.getPermissions()).toBeNull();

	expect(
		page.eval(call(UPDATE, [ORIGIN], TOKEN, nativeState({ revision: 5 })))
	).toBe(true);
	expect(listener).toHaveBeenCalledTimes(1);
	expect(source?.getState()?.revision).toBe(5);
	expect(source?.getPermissions()?.measurement).toBe(true);
});

test('scripts cannot scope consent by web view, so a shared controller needs one authority', () => {
	// Web views 1 and 2 share a WKUserContentController. Helper A (web view 1)
	// allows a.example; helper B (web view 2) allows only b.example.
	const a = call(
		DOCUMENT_START,
		['https://a.example'],
		TOKEN,
		KEY,
		nativeState({ permissions: { marketing: true }, tcString: 'CQ-A' })
	);
	const b = call(
		DOCUMENT_START,
		['https://b.example'],
		'0'.repeat(32),
		'1'.repeat(32),
		nativeState()
	);

	// Shared controller: web view 2 loads a.example and runs both scripts.
	const shared = openWindow('https://a.example');
	shared.eval(a);
	shared.eval(b);
	expect(webViewConsentSource()?.getState()).toMatchObject({
		permissions: { marketing: true },
		tcString: 'CQ-A',
	});

	// Own controller: web view 2 runs only B's script, and a.example gets nothing.
	const own = openWindow('https://a.example');
	own.eval(b);
	expect(webViewConsentSource()).toBeUndefined();
});

test('removing an origin from the list revokes the page already loaded from it', () => {
	const page = openWindow();
	const granted = nativeState({
		permissions: { marketing: true, measurement: true },
	});
	page.eval(call(DOCUMENT_START, [ORIGIN], TOKEN, KEY, granted));
	const source = webViewConsentSource();
	expect(source?.getPermissions()?.marketing).toBe(true);

	// The app replaces its list without this origin. An update addressed to the
	// new list never reaches the page, so on its own it would keep the grant.
	const denied = nativeState({
		permissions: { marketing: false },
		revision: 5,
	});
	expect(
		page.eval(call(UPDATE, ['https://other.example'], TOKEN, denied))
	).toBe(false);
	expect(source?.getPermissions()?.marketing).toBe(true);

	// So the helpers first revoke the dropped origin with the page's own token.
	const revoked = nativeState({
		permissions: {},
		ready: false,
		revision: 5,
	});
	expect(page.eval(call(UPDATE, [ORIGIN], TOKEN, revoked))).toBe(true);
	expect(source?.getPermissions()).toBeNull();
	expect(source?.getState()?.permissions.marketing).toBe(false);
});

test('the update script does nothing once the page left the listed origins', () => {
	const page = openWindow('https://other.example');
	expect(page.eval(call(UPDATE, [ORIGIN], TOKEN, nativeState()))).toBe(false);
});

test('malformed state grants nothing', () => {
	const page = openWindow();
	page.eval(
		call(DOCUMENT_START, [ORIGIN], TOKEN, KEY, {
			permissions: { marketing: 'yes', measurement: 1 },
			ready: true,
			version: 1,
		})
	);
	expect(webViewConsentSource()?.getPermissions()).toEqual({
		experience: false,
		functionality: false,
		marketing: false,
		measurement: false,
		necessary: true,
	});
});

test('opening preferences asks the app through its message channel', () => {
	const page = openWindow();
	const postMessage = vi.fn();
	Object.assign(page, {
		webkit: { messageHandlers: { c15tConsent: { postMessage } } },
	});
	page.eval(call(DOCUMENT_START, [ORIGIN], TOKEN, KEY, nativeState()));
	webViewConsentSource()?.openPreferences();
	expect(postMessage).toHaveBeenCalledWith(
		`{"type":"c15t:open-preferences","key":"${KEY}"}`
	);
});

test('the runtime follows the app and shows no banner', () => {
	const page = openWindow();
	page.eval(
		call(
			DOCUMENT_START,
			[ORIGIN],
			TOKEN,
			KEY,
			nativeState({
				permissions: { measurement: false },
			})
		)
	);
	const consentSource = webViewConsentSource();
	// The runtime renders into the test's document, not the stand-in realm.
	vi.unstubAllGlobals();
	const runtime = createConsentRuntime({
		consentSource,
		iframeBlocker: false,
		mode: transportMode(createOfflineTransport({ acknowledgeNoRecords: true })),
	});
	runtime.start();
	expect(runtime.kernel.getSnapshot().activeUI).toBe('none');
	expect(runtime.kernel.getSnapshot().effectivePermissions.measurement).toBe(
		false
	);

	page.eval(call(UPDATE, [ORIGIN], TOKEN, nativeState({ revision: 5 })));
	expect(runtime.kernel.getSnapshot().effectivePermissions.measurement).toBe(
		true
	);
	expect(runtime.kernel.getSnapshot().explicitChoice).toBeNull();
	expect(runtime.kernel.getSnapshot().activeUI).toBe('none');
	runtime.dispose();
});
