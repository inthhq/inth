/** @vitest-environment jsdom */
import { describe, expect, it } from 'vite-plus/test';

import { npmAndRemote } from './__tests__/remote-path';
import {
	clearAllScripts,
	ALL_DENIED,
	grantedMarketingConsents,
	grantedMeasurementConsents,
	installHeadProbe,
	loadScripts,
	registerVendorContractCleanup,
	settleScripts,
	updateScripts,
} from './e2e-test-utils';
import { vercelSpeedInsights } from './vendors/analytics/vercel-speed-insights';
import type { VercelSpeedInsightsBeforeSend } from './vendors/analytics/vercel-speed-insights';

type SpeedInsightsWindow = Window & {
	si?: (action: string, handler: VercelSpeedInsightsBeforeSend) => void;
	siq?: [string, VercelSpeedInsightsBeforeSend][];
	sil?: boolean;
};

const event = {
	type: 'vital',
	url: 'https://example.com/',
} as const;

// Mirrors script.js: it starts once per page, guarded by `window.sil`, then
// swaps the `si` stub for a setter and replays `siq`.
const installCollector = function installCollector() {
	const appended: HTMLScriptElement[] = [];
	let beforeSend: VercelSpeedInsightsBeforeSend | undefined;

	installHeadProbe((node, win) => {
		if (!node.src.includes('/v1/speed-insights/script.js')) {
			return;
		}
		appended.push(node);
		const siWindow = win as SpeedInsightsWindow;
		if (siWindow.sil) {
			return;
		}
		siWindow.sil = true;
		siWindow.si = (action, handler) => {
			if (action === 'beforeSend') {
				beforeSend = handler;
			}
		};
		for (const [action, handler] of siWindow.siq ?? []) {
			siWindow.si(action, handler);
		}
	});

	return {
		appended,
		send: () => (beforeSend ? beforeSend(event) : undefined),
	};
};

describe('Vercel Speed Insights loader contract', () => {
	registerVendorContractCleanup();

	it('gates reports on measurement through grant, revoke and a new grant', () => {
		const { appended, send } = installCollector();

		const scripts = [vercelSpeedInsights({ sampleRate: 0.5 })];
		loadScripts(scripts, ALL_DENIED);
		expect(appended).toHaveLength(0);
		expect((window as SpeedInsightsWindow).siq).toBeUndefined();

		updateScripts(scripts, grantedMeasurementConsents);
		expect(appended).toHaveLength(1);
		expect(appended[0]?.defer).toBe(true);
		expect(appended[0]?.getAttribute('data-sdkn')).toBe('inth');
		expect(appended[0]?.getAttribute('data-sample-rate')).toBe('0.5');
		expect(send()).toEqual(event);

		updateScripts(scripts, ALL_DENIED);
		expect(appended[0]?.isConnected).toBe(false);
		expect(send()).toBeNull();

		// An unrelated category change keeps reports dropped.
		updateScripts(scripts, grantedMarketingConsents);
		expect(send()).toBeNull();

		updateScripts(scripts, grantedMeasurementConsents);
		expect(appended).toHaveLength(2);
		expect(send()).toEqual(event);
	});

	it('drops reports after the loader is disposed', () => {
		const { send } = installCollector();

		loadScripts([vercelSpeedInsights()], grantedMeasurementConsents);
		expect(send()).toEqual(event);

		clearAllScripts();
		expect(send()).toBeNull();
	});

	it('keeps reporting when a rerender passes a new helper object', () => {
		const { appended, send } = installCollector();

		loadScripts([vercelSpeedInsights()], grantedMeasurementConsents);
		updateScripts([vercelSpeedInsights()], grantedMeasurementConsents);

		expect(appended).toHaveLength(2);
		expect(appended[0]?.isConnected).toBe(false);
		expect(appended[1]?.isConnected).toBe(true);
		expect(send()).toEqual(event);

		updateScripts([vercelSpeedInsights()], ALL_DENIED);
		expect(send()).toBeNull();
	});
});

describe.each(npmAndRemote('vercelSpeedInsights', vercelSpeedInsights))(
	'Vercel Speed Insights dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('loads the debug collector after measurement consent and drops reports once consent goes', async () => {
			let beforeSend: VercelSpeedInsightsBeforeSend | undefined;
			const append = installHeadProbe((node, win) => {
				if (!node.src.endsWith('/v1/speed-insights/script.debug.js')) {
					return;
				}
				const siWindow = win as SpeedInsightsWindow;
				siWindow.sil = true;
				const queued = siWindow.siq ?? [];
				siWindow.si = (action, handler) => {
					if (action === 'beforeSend') {
						beforeSend = handler;
					}
				};
				for (const [action, handler] of queued) {
					siWindow.si(action, handler);
				}
			});
			const scripts = [
				build({ debug: true, dsn: 'prj_abc123', sampleRate: 0.25 }),
			];
			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(append).not.toHaveBeenCalled();

			updateScripts(scripts, grantedMeasurementConsents);
			const [element] = append.mock.calls[0] ?? [];
			expect(element).toBeInstanceOf(HTMLScriptElement);
			expect((element as HTMLScriptElement).src).toBe(
				'https://va.vercel-scripts.com/v1/speed-insights/script.debug.js'
			);
			expect((element as HTMLScriptElement).dataset).toMatchObject({
				dsn: 'prj_abc123',
				sampleRate: '0.25',
			});
			expect(beforeSend?.(event)).toEqual(event);

			updateScripts(scripts, ALL_DENIED);
			expect(beforeSend?.(event)).toBeNull();
		});
	}
);
