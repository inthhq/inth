/**
 * `consentManifest()` loads `@inth/react/static-banner` in Node during
 * `vite build`, where there is no document.
 */
import { expect, test } from 'vite-plus/test';

import init from '../../../core/src/runtime/__tests__/fixtures/hosted-init-gb.json' with { type: 'json' };
import { renderStaticBanner, staticBannerSheets } from '../static-banner';

test('renders the stock banner for the UK /init answer in Node', () => {
	expect(typeof document).toBe('undefined');
	const html = renderStaticBanner(init as never);
	expect(html).toContain('data-testid="consent-banner-root"');
	expect(html).toContain('data-testid="consent-banner-accept-button"');
	expect(html).toContain(init.translations.translations.cookieBanner.title);
	expect(staticBannerSheets(html).length).toBeGreaterThan(0);
});
