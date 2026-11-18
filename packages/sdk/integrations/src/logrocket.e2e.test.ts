/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';

import {
	deniedConsents,
	grantedMeasurementConsents,
	installHeadProbe,
	loadScripts,
	registerVendorContractCleanup,
	updateScripts,
} from './e2e-test-utils';
import { logRocket } from './vendors/analytics/logrocket';

describe('logRocket contract', () => {
	registerVendorContractCleanup();

	it('gates loading on measurement consent, initializes after load, and unloads on revoke', () => {
		let appendCount = 0;
		let crossoriginAttribute: string | null | undefined;
		let initBeforeLoad = false;
		const init = vi.fn();

		installHeadProbe((node, win) => {
			if (!node.src.includes('cdn.logrocket.io/LogRocket.min.js')) {
				return;
			}

			appendCount += 1;
			crossoriginAttribute = node.getAttribute('crossorigin');
			win.LogRocket = {
				init,
			};
			initBeforeLoad = init.mock.calls.length > 0;
			node.dispatchEvent(new Event('load'));
		});

		const script = {
			...logRocket({
				appId: 'inthfake/inthfake',
				initOptions: {
					dom: {
						inputSanitizer: true,
					},
				},
			}),
			anonymizeId: false,
			id: 'logrocket-contract',
		};

		loadScripts([script], deniedConsents);
		expect(appendCount).toBe(0);

		loadScripts([script], grantedMeasurementConsents);

		expect(appendCount).toBe(1);
		expect(crossoriginAttribute).toBe('anonymous');
		expect(initBeforeLoad).toBe(false);
		expect(init).toHaveBeenCalledWith('inthfake/inthfake', {
			dom: {
				inputSanitizer: true,
			},
		});
		expect(
			document.getElementById('inth-script-logrocket-contract')
		).toBeInstanceOf(HTMLScriptElement);

		const result = updateScripts([script], deniedConsents);

		expect(result.unloaded).toEqual(['logrocket-contract']);
		expect(
			document.getElementById('inth-script-logrocket-contract')
		).toBeNull();
	});
});
