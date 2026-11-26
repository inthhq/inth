/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vite-plus/test';

import { npmAndRemote } from './__tests__/remote-path';
import {
	ALL_DENIED,
	grantedMarketingConsents,
	grantedMeasurementConsents,
	installHeadProbe,
	loadScripts,
	registerVendorContractCleanup,
} from './e2e-test-utils';
import { clearbit } from './vendors/analytics/clearbit';

describe.each(npmAndRemote('clearbit', clearbit))(
	'clearbit contract through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('gates loading on marketing consent and exposes loader attributes before append', () => {
			let appendCount = 0;
			let attributes: Record<string, string | null> | undefined;

			installHeadProbe((node) => {
				if (
					!node.src.includes('tag.clearbitscripts.com/v1/pk_contract/tags.js')
				) {
					return;
				}

				appendCount += 1;
				attributes = {
					referrerpolicy: node.getAttribute('referrerpolicy'),
				};
				node.dispatchEvent(new Event('load'));
			});

			const script = {
				...build({
					publishableKey: 'pk_contract',
				}),
				id: 'clearbit-contract',
			};

			loadScripts([script], ALL_DENIED);
			expect(appendCount).toBe(0);

			loadScripts([script], grantedMeasurementConsents);
			expect(appendCount).toBe(0);

			loadScripts([script], grantedMarketingConsents);

			expect(appendCount).toBe(1);
			expect(attributes).toEqual({
				referrerpolicy: 'strict-origin-when-cross-origin',
			});
		});
	}
);
