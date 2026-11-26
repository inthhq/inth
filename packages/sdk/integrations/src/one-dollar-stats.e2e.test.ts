/** @vitest-environment jsdom */
import { describe, expect, it } from 'vite-plus/test';

import { npmAndRemote } from './__tests__/remote-path';
import {
	ALL_DENIED,
	grantedMeasurementConsents,
	installHeadProbe,
	loadScripts,
	registerVendorContractCleanup,
	settleScripts,
	updateScripts,
} from './e2e-test-utils';
import { oneDollarStats } from './vendors/analytics/one-dollar-stats';

describe('OneDollarStats loader contract', () => {
	registerVendorContractCleanup();

	it('waits for measurement consent and sets classic script attributes before append', () => {
		let appended: HTMLScriptElement | undefined;
		installHeadProbe((node) => {
			if (!node.src.includes('assets.onedollarstats.com/stonks.js')) {
				return;
			}
			appended = node;
			expect(node.type).not.toBe('module');
			expect(node.defer).toBe(true);
			expect(node.getAttribute('data-hostname')).toBe('docs.example.com');
			expect(node.getAttribute('data-devmode')).toBe('true');
			expect(node.getAttribute('data-autocollect')).toBe('false');
			expect(node.hasAttribute('data-hash-routing')).toBe(false);
			node.dispatchEvent(new Event('load'));
		});

		const scripts = [
			oneDollarStats({
				autocollect: 'false',
				devmode: 'true',
				'hash-routing': 'false',
				hostname: 'docs.example.com',
			}),
		];
		loadScripts(scripts, ALL_DENIED);
		expect(appended).toBeUndefined();

		updateScripts(scripts, grantedMeasurementConsents);
		expect(appended).toBeDefined();
		expect(appended?.isConnected).toBe(true);

		updateScripts(scripts, ALL_DENIED);
		expect(appended?.isConnected).toBe(false);
	});
});

describe.each(npmAndRemote('oneDollarStats', oneDollarStats))(
	'OneDollarStats with no settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('waits for measurement consent, appends the classic script and removes it on revoke', async () => {
			let appended: HTMLScriptElement | undefined;
			installHeadProbe((node) => {
				if (!node.src.includes('assets.onedollarstats.com/stonks.js')) {
					return;
				}
				appended = node;
				node.dispatchEvent(new Event('load'));
			});
			const scripts = [build({})];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(appended).toBeUndefined();

			updateScripts(scripts, grantedMeasurementConsents);
			expect(appended?.isConnected).toBe(true);
			expect(appended?.type).not.toBe('module');
			expect(appended?.defer).toBe(true);
			expect(
				appended?.getAttributeNames().filter((name) => name.startsWith('data-'))
			).toEqual([]);

			updateScripts(scripts, ALL_DENIED);
			expect(appended?.isConnected).toBe(false);
		});
	}
);
