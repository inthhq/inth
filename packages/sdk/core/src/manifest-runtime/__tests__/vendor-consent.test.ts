import { describe, expect, it } from 'vite-plus/test';

import { ALL_DENIED, signalConsents } from '../vendor-consent';

describe('signalConsents', () => {
	it('gives a vendor the visitor turned off a denial no caller can change', () => {
		const denied = signalConsents({
			consents: { ...ALL_DENIED, measurement: true },
			vendor: { granted: false } as never,
		});

		expect(() => {
			(denied as { measurement: boolean }).measurement = true;
		}).toThrow(TypeError);
		expect(
			signalConsents({
				consents: ALL_DENIED,
				vendor: { granted: false } as never,
			}).measurement
		).toBe(false);
	});
});
