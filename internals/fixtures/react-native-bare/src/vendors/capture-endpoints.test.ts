import { describe, expect, it } from 'vite-plus/test';

import { vendorCaptureEndpoints } from './capture-endpoints';

describe('vendorCaptureEndpoints', () => {
	it('routes every SDK to the capture server, Sentry through its DSN', () => {
		expect(vendorCaptureEndpoints('http://localhost:3000/')).toEqual({
			amplitudeServerUrl: 'http://localhost:3000/vendor/amplitude/2/httpapi',
			mixpanelServerURL: 'http://localhost:3000/vendor/mixpanel',
			posthogHost: 'http://localhost:3000/vendor/posthog',
			sentryDsn: 'http://public@localhost:3000/vendor/sentry/1',
		});
	});

	it('sends Mixpanel to its own origin when one is given', () => {
		expect(
			vendorCaptureEndpoints('http://localhost:3000', 'http://10.0.2.2:39873')
				.mixpanelServerURL
		).toBe('http://10.0.2.2:39873/vendor/mixpanel');
	});

	it('rejects a base URL with a path, which would misplace the Sentry project', () => {
		expect(() => vendorCaptureEndpoints('http://localhost:3000/api')).toThrow(
			TypeError
		);
	});
});
