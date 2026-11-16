// #region docs:csp-nonce title="src/app/app.config.ts"
import { CSP_NONCE, provideZonelessChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { hosted, provideC15t } from '@c15t/angular';

import { scripts } from '../scripts';

// A nonce from your own source, such as a meta tag your server writes.
// With <app-root ngCspNonce="..."> you can leave CSP_NONCE out: Angular
// reads the attribute itself, and c15t uses the token for its <style> and
// <script> elements. `nonce` on provideC15t() would win over both.
const nonce =
	globalThis.document
		?.querySelector('meta[name="csp-nonce"]')
		?.getAttribute('content') ?? null;

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		{ provide: CSP_NONCE, useValue: nonce },
		provideC15t({
			mode: hosted({ backendURL: 'https://your-project.inth.app' }),
			scripts,
		}),
	],
};
// #endregion docs:csp-nonce
