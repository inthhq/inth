/**
 * A site page inside a c15t mobile app's WebView, in real Chromium.
 *
 * The fixture server puts the canonical native document-start script
 * (`native/protocol/webview/document-start.js`) first in `<head>`, which is
 * where `WKUserScript` and `addDocumentStartJavaScript` run it. The page then
 * starts web c15t with its stock banner and `webViewConsentSource()`.
 */
import { clearBrowserConsentStorage } from '@c15t/conformance/suite';
import { afterEach, expect, it, vi } from 'vitest';

import UPDATE_SCRIPT from '../../../../native/protocol/webview/update.js?raw';
// The fixture page imports the client. Importing it here makes Vite
// transform its graph while it collects this file, not inside the first
// test's timeout. See csp-nonce.browser.test.ts.
import '../client';
import type { WebViewPage } from './fixtures/webview-page';

vi.setConfig({ testTimeout: 60_000 });

const TOKEN = 'feedc0de00000000feedc0de00000000';
const BANNER = '[data-testid="consent-banner-root"]';

const opened: Window[] = [];

/** The stock banner, wherever the UI mounted it. */
const banner = (tab: Window, page: WebViewPage): Element | null =>
	page.client.ui?.root?.querySelector(BANNER) ??
	tab.document.querySelector(BANNER);

const openPage = async (query = ''): Promise<[Window, WebViewPage]> => {
	const tab = window.open(`/__c15t-test__/webview${query}`, '_blank');
	if (!tab) {
		throw new Error('The browser blocked the page');
	}
	opened.push(tab);
	const read = () =>
		(tab as Window & { c15tWebView?: WebViewPage }).c15tWebView;
	// A cold tab transforms the client's module graph first, which takes
	// longer while other suites load theirs.
	await expect.poll(read, { timeout: 45_000 }).toBeDefined();
	const page = read() as WebViewPage;
	await page.ready;
	return [tab, page];
};

const nativeState = (marketing: boolean) => ({
	gppString: null,
	model: 'opt-in',
	permissions: {
		experience: false,
		functionality: false,
		marketing,
		measurement: true,
		necessary: true,
	},
	ready: true,
	revision: 4,
	tcString: null,
	version: 1,
});

/** Run the native update script in the page, as `evaluateJavaScript` would. */
const pushNative = (
	tab: Window,
	token: string,
	state: ReturnType<typeof nativeState>
): unknown => {
	const origins = JSON.stringify([tab.location.origin]);
	return (tab as Window & { eval: (code: string) => unknown }).eval(
		`${UPDATE_SCRIPT.trim().replace(/;$/u, '')}(${origins},${JSON.stringify(token)},${JSON.stringify(state)});`
	);
};

afterEach(() => {
	for (const tab of opened.splice(0)) {
		tab.close();
	}
	clearBrowserConsentStorage();
});

it('shows no banner after a native choice and follows the native permissions', async () => {
	const [tab, page] = await openPage();
	expect(page.native).toBe(true);
	// Give the UI a frame to mount whatever it would mount.
	await new Promise((resolve) => {
		setTimeout(resolve, 100);
	});
	expect(banner(tab, page)).toBeNull();
	const snapshot = page.client.getSnapshot();
	expect(snapshot.activeUI).toBe('none');
	expect(snapshot.effectivePermissions).toMatchObject({
		marketing: false,
		measurement: true,
	});
	// Nothing is stored in the page: the app keeps the record.
	expect(snapshot.explicitChoice).toBeNull();
	expect(tab.document.cookie).not.toContain('c15t');
});

it('follows a native change while the page is open, and only from the app', async () => {
	const [tab, page] = await openPage();

	expect(pushNative(tab, 'forged-token', nativeState(true))).toBe(false);
	expect(page.client.getSnapshot().effectivePermissions.marketing).toBe(false);

	expect(pushNative(tab, TOKEN, nativeState(true))).toBe(true);
	await expect
		.poll(() => page.client.getSnapshot().effectivePermissions.marketing)
		.toBe(true);
	expect(banner(tab, page)).toBeNull();
});

it('asks the app for its preferences instead of opening a web dialog', async () => {
	const [tab, page] = await openPage();
	page.client.openDialog();
	expect(page.posted).toEqual([
		'{"type":"c15t:open-preferences","key":"0badc0de0badc0de0badc0de0badc0de"}',
	]);
	expect(page.client.getSnapshot().activeUI).toBe('none');
	expect(banner(tab, page)).toBeNull();
});

it('shows the web banner on an origin the app did not list', async () => {
	const [tab, page] = await openPage('?origin=other');
	expect(page.native).toBe(false);
	await expect
		.poll(() => banner(tab, page), { timeout: 10_000 })
		.not.toBeNull();
});
