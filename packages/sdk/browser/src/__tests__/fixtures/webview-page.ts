/**
 * A site page running web c15t with its stock banner, the way a site does
 * when a c15t mobile app may open it in a WebView. The server put the native
 * document-start script first in `<head>`, as `WKUserScript` and
 * `addDocumentStartJavaScript` would.
 */
import { webViewConsentSource } from '@c15t/core';

import { createTestingConsentClient as createConsentClient } from '../../testing-global';
import type { ConsentClient } from '../../types';
import { mountConsentUI } from '../../ui/mount';

/** What the test reads from the page. */
export interface WebViewPage {
	client: ConsentClient;
	/** Whether this page found native consent. */
	native: boolean;
	/** Messages the page posted to the app. */
	posted: string[];
	ready: Promise<unknown>;
}

const posted: string[] = [];
// Stands in for the iOS message handler. Defined after the native script ran,
// as the channel only matters when the page asks for preferences.
Object.assign(window, {
	webkit: {
		messageHandlers: {
			c15tConsent: { postMessage: (message: string) => posted.push(message) },
		},
	},
});

const consentSource = webViewConsentSource();
const client = createConsentClient(
	{
		consentCategories: ['necessary', 'measurement', 'marketing'],
		consentSource,
		overrides: { country: 'DE' },
		reloadOnConsentRevoked: false,
		ui: { disableAnimation: true },
	},
	{ mountUI: mountConsentUI }
);
client.start();

const page: WebViewPage = {
	client,
	native: consentSource !== undefined,
	posted,
	ready: client.ready(),
};
Object.assign(window, { c15tWebView: page });
