/**
 * The React Native WebView helper: what it injects, when it pushes an
 * update, and which page messages it answers.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

import type { ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import {
	buildSnapshot,
	captureErrorMessage,
	createFakeNativeModule,
	flush,
	renderTree,
} from '../../__tests__/helpers/fake-native';
import { resetNativeStub } from '../../__tests__/helpers/react-native-stub';
import { resetConsentClient } from '../../native/client';
import { ConsentProvider } from '../../provider/consent-provider';
import { normalizeWebViewOrigin, parseWebViewConsent } from '../payload';
import { DOCUMENT_START_SCRIPT, UPDATE_SCRIPT } from '../scripts.generated';
import { useWebViewConsent } from '../use-webview-consent';
import type {
	UseWebViewConsentOptions,
	WebViewConsentProps,
} from '../use-webview-consent';

const protocol = (name: string) =>
	resolve(__dirname, '../../../../../native/protocol/webview', name);

const seen: WebViewConsentProps[] = [];

const Probe = (props: UseWebViewConsentOptions): ReactNode => {
	seen.push(useWebViewConsent(props));
	return null;
};

const latest = (): WebViewConsentProps => {
	const props = seen.at(-1);
	if (!props) {
		throw new Error('the probe never rendered');
	}
	return props;
};

afterEach(() => {
	seen.length = 0;
	resetConsentClient();
	resetNativeStub();
});

test('the generated scripts are the protocol files', () => {
	const read = (name: string) =>
		readFileSync(protocol(name), 'utf8').trim().replace(/;$/u, '');
	expect(DOCUMENT_START_SCRIPT).toBe(read('document-start.js'));
	expect(UPDATE_SCRIPT).toBe(read('update.js'));
});

test('origins normalize like every other platform', () => {
	const { cases } = JSON.parse(
		readFileSync(protocol('origins.json'), 'utf8')
	) as { cases: { input: string; origin: string | null }[] };
	expect(cases.length).toBeGreaterThan(20);
	for (const { input, origin } of cases) {
		expect(normalizeWebViewOrigin(input), input).toBe(origin);
	}
});

test('a malformed bridge reply injects nothing', () => {
	expect(parseWebViewConsent('nope')).toBeNull();
	expect(
		parseWebViewConsent(
			'{"state":{"version":1},"token":"0123456789abcdef0123456789abcdef"}'
		)
	).toBeNull();
	expect(
		parseWebViewConsent('{"state":{"version":1},"token":"short"}')
	).toBeNull();
	expect(
		parseWebViewConsent(
			'{"state":{"version":2},"token":"0123456789abcdef0123456789abcdef"}'
		)
	).toBeNull();
});

test('injects the native state at document start for the listed origins', () => {
	createFakeNativeModule();
	renderTree(
		<ConsentProvider>
			<Probe allowedOrigins={['https://WWW.example.com/']} />
		</ConsentProvider>
	);
	const props = latest();
	expect(props.injectedJavaScriptBeforeContentLoadedForMainFrameOnly).toBe(
		true
	);
	expect(props.injectedJavaScriptBeforeContentLoaded).toContain(
		`${DOCUMENT_START_SCRIPT}(["https://www.example.com"],"0123456789abcdef0123456789abcdef","fedcba9876543210fedcba9876543210",`
	);
	expect(props.injectedJavaScriptBeforeContentLoaded).not.toContain('sub-1');
});

test('pushes a changed state into the loaded page, once per change', () => {
	const fake = createFakeNativeModule();
	renderTree(
		<ConsentProvider>
			<Probe allowedOrigins={['https://www.example.com']} />
		</ConsentProvider>
	);
	const injectJavaScript = vi.fn();
	flush(() => {
		latest().ref({ injectJavaScript });
	});
	expect(injectJavaScript).not.toHaveBeenCalled();

	flush(() => {
		fake.pushSnapshot(
			buildSnapshot({
				effectivePermissions: {
					experience: false,
					functionality: true,
					marketing: true,
					measurement: true,
					necessary: true,
				},
				revision: 1,
			})
		);
	});
	expect(injectJavaScript).toHaveBeenCalledTimes(1);
	const [script] = injectJavaScript.mock.calls[0] as [string];
	expect(script.startsWith(`${UPDATE_SCRIPT}(`)).toBe(true);
	expect(script).toContain('"marketing":true');
	expect(latest().injectedJavaScriptBeforeContentLoaded).toContain(
		'"revision":1'
	);
});

test("answers only a preferences request that carries the top frame's key", () => {
	createFakeNativeModule();
	const onPreferencesRequested = vi.fn();
	renderTree(
		<ConsentProvider>
			<Probe
				allowedOrigins={['https://www.example.com']}
				onPreferencesRequested={onPreferencesRequested}
			/>
		</ConsentProvider>
	);
	const message = (data: string, url: string, isTopFrame?: boolean) => {
		latest().onMessage({ nativeEvent: { data, isTopFrame, url } });
	};
	const request =
		'{"type":"c15t:open-preferences","key":"fedcba9876543210fedcba9876543210"}';
	// An iframe on the listed page: `react-native-webview` on Android reports
	// the top page's URL and no frame, but the frame cannot read the key.
	message('{"type":"c15t:open-preferences"}', 'https://www.example.com/');
	message(
		'{"type":"c15t:open-preferences","key":"00000000000000000000000000000000"}',
		'https://www.example.com/'
	);
	message(request, 'https://evil.example/');
	message(request, 'https://www.example.com/', false);
	message('{"type":"c15t:save"}', 'https://www.example.com/');
	expect(onPreferencesRequested).not.toHaveBeenCalled();
	message(request, 'https://www.example.com/cookies?x=1');
	expect(onPreferencesRequested).toHaveBeenCalledTimes(1);
	// A burst, such as a frame posting in a loop, opens the screen once.
	message(request, 'https://www.example.com/');
	expect(onPreferencesRequested).toHaveBeenCalledTimes(1);
});

/** A top-level page realm at `origin`, as a WebView page would be. */
const openPage = (origin: string) => {
	const context = createContext({});
	runInContext(
		`globalThis.window = globalThis; globalThis.top = globalThis;
		globalThis.location = Object.freeze({ origin: ${JSON.stringify(origin)} });`,
		context
	);
	const run = (code: string): unknown => runInContext(code, context);
	const state = () =>
		JSON.parse(
			run('JSON.stringify(window.__c15tNativeConsent.getState())') as string
		) as { ready: boolean; permissions: Record<string, boolean> };
	return { run, state };
};

const GRANTED = {
	experience: false,
	functionality: true,
	marketing: true,
	measurement: true,
	necessary: true,
};

test('dropping an origin revokes the page already loaded from it', () => {
	createFakeNativeModule({
		snapshot: buildSnapshot({ effectivePermissions: GRANTED }),
	});
	const handle = renderTree(
		<ConsentProvider>
			<Probe allowedOrigins={['https://old.example', 'https://kept.example']} />
		</ConsentProvider>
	);
	const page = openPage('https://old.example');
	page.run(latest().injectedJavaScriptBeforeContentLoaded);
	expect(page.state().permissions.marketing).toBe(true);
	const injected: string[] = [];
	flush(() => {
		latest().ref({ injectJavaScript: (script) => injected.push(script) });
	});

	handle.rerender(
		<ConsentProvider>
			<Probe allowedOrigins={['https://kept.example']} />
		</ConsentProvider>
	);
	for (const script of injected) {
		page.run(script);
	}

	// The page no longer receives updates, so it must not keep the grant.
	expect(page.state().ready).toBe(false);
	expect(page.state().permissions.marketing).toBe(false);
});

test('a page on an origin that stays listed keeps following the app', () => {
	createFakeNativeModule({
		snapshot: buildSnapshot({ effectivePermissions: GRANTED }),
	});
	const handle = renderTree(
		<ConsentProvider>
			<Probe allowedOrigins={['https://old.example', 'https://kept.example']} />
		</ConsentProvider>
	);
	const page = openPage('https://kept.example');
	page.run(latest().injectedJavaScriptBeforeContentLoaded);
	const injected: string[] = [];
	flush(() => {
		latest().ref({ injectJavaScript: (script) => injected.push(script) });
	});
	handle.rerender(
		<ConsentProvider>
			<Probe allowedOrigins={['https://kept.example']} />
		</ConsentProvider>
	);
	for (const script of injected) {
		page.run(script);
	}
	expect(page.state().ready).toBe(true);
	expect(page.state().permissions.marketing).toBe(true);
});

test('the native GPP string reaches the page unchanged', () => {
	const fake = createFakeNativeModule();
	fake.getWebViewConsent = vi.fn(() =>
		JSON.stringify({
			key: 'fedcba9876543210fedcba9876543210',
			state: {
				gppString: 'DBABMA~CQ',
				model: 'opt-in',
				permissions: GRANTED,
				ready: true,
				revision: 2,
				tcString: null,
				version: 1,
			},
			token: '0123456789abcdef0123456789abcdef',
		})
	);
	renderTree(
		<ConsentProvider>
			<Probe allowedOrigins={['https://www.example.com']} />
		</ConsentProvider>
	);
	expect(latest().injectedJavaScriptBeforeContentLoaded).toContain(
		'"gppString":"DBABMA~CQ"'
	);
});

test('an entry holding a line break stays one invalid origin', () => {
	createFakeNativeModule();
	const message = captureErrorMessage(() => {
		renderTree(
			<ConsentProvider>
				<Probe
					allowedOrigins={['https://trusted.example\nhttps://other.example']}
				/>
			</ConsentProvider>
		);
	});
	expect(message).toContain('not an allowed WebView origin');
});

test('an unsafe origin list is a wiring mistake, not a silent no-op', () => {
	createFakeNativeModule();
	const message = captureErrorMessage(() => {
		renderTree(
			<ConsentProvider>
				<Probe allowedOrigins={['http://www.example.com']} />
			</ConsentProvider>
		);
	});
	expect(message).toContain('not an allowed WebView origin');
});
