/**
 * @vitest-environment jsdom
 */

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
import { clarity } from './vendors/analytics/microsoft-clarity';

type ClarityStub = ((...args: unknown[]) => void) & {
	q?: unknown[][];
	v?: string;
};

describe('microsoft clarity contract', () => {
	registerVendorContractCleanup();

	it('queues Consent V2 before load without duplicate-install metadata', () => {
		let queueSnapshot: unknown[][] | undefined;
		let scriptSrc: string | undefined;
		let stubVersion: unknown;

		installHeadProbe((node, win) => {
			if (!node.src.includes('clarity.ms/tag/CLARITY-CONTRACT')) {
				return;
			}

			const clarityStub = win.clarity as ClarityStub | undefined;
			scriptSrc = node.src;
			stubVersion = clarityStub?.v;
			queueSnapshot = clarityStub?.q?.map((entry) => [...entry]);

			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...clarity({ id: 'CLARITY-CONTRACT' }),
					id: 'microsoft-clarity-contract',
				},
			],
			grantedMeasurementConsents
		);

		expect(scriptSrc).toContain('/tag/CLARITY-CONTRACT');
		expect(stubVersion).toBeUndefined();
		expect(queueSnapshot).toEqual([
			[
				'consentv2',
				{
					ad_Storage: 'denied',
					analytics_Storage: 'granted',
				},
			],
		]);
	});
});

describe.each(npmAndRemote('microsoft-clarity', clarity))(
	'Microsoft Clarity dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('waits for measurement, queues Consent V2 before load, and keeps it current after a withdrawal', async () => {
			let queueSnapshot: unknown[][] | undefined;
			installHeadProbe((node, win) => {
				if (!node.src.includes('clarity.ms/tag/abcdef1234')) {
					return;
				}
				queueSnapshot = (win.clarity as ClarityStub | undefined)?.q?.map(
					(entry) => [...entry]
				);
			});
			const win = window as unknown as { clarity?: ClarityStub };
			const scripts = [build({ id: 'abcdef1234' })];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(document.querySelector('script[src*="clarity.ms"]')).toBeNull();
			expect(win.clarity).toBeUndefined();

			updateScripts(scripts, grantedMeasurementConsents);
			await settleScripts();
			expect(queueSnapshot).toEqual([
				['consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }],
			]);

			updateScripts(scripts, ALL_DENIED);
			expect(win.clarity?.q?.at(-1)).toEqual([
				'consentv2',
				{ ad_Storage: 'denied', analytics_Storage: 'denied' },
			]);
		});

		it('keeps ad storage allowed when only measurement is withdrawn', async () => {
			const win = window as unknown as { clarity?: ClarityStub };
			const scripts = [build({ id: 'abcdef1234' })];
			const both = { ...grantedMeasurementConsents, marketing: true };

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			updateScripts(scripts, both);
			await settleScripts();
			updateScripts(scripts, { ...both, measurement: false });

			expect(win.clarity?.q?.at(-1)).toEqual([
				'consentv2',
				{ ad_Storage: 'granted', analytics_Storage: 'denied' },
			]);
		});
	}
);
