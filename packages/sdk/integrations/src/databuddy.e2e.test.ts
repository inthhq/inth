/**
 * @vitest-environment jsdom
 */

import { createConsentKernel } from '@inth/sdk/engine';
import { createScriptLoader } from '@inth/sdk/modules/script-loader';
import { describe, expect, it, vi } from 'vite-plus/test';

import { npmAndRemote } from './__tests__/remote-path';
import { remoteTraceFactory } from './__tests__/trace/remote';
import {
	clearAllScripts,
	ALL_DENIED,
	grantedMeasurementConsents,
	installHeadProbe,
	loadScripts,
	registerVendorContractCleanup,
	settleScripts,
	updateScripts,
} from './e2e-test-utils';
import type { TestWindow } from './e2e-test-utils';
import { databuddy } from './vendors/analytics/databuddy';

const isDatabuddyLoader = function isDatabuddyLoader(
	node: HTMLScriptElement
): boolean {
	return node.src.includes('cdn.databuddy.cc/databuddy.');
};

const isReplayLoader = function isReplayLoader(
	node: HTMLScriptElement
): boolean {
	return node.src.includes('cdn.databuddy.cc/replay.');
};

/**
 * Stands in for `databuddy.js` and `replay.js`: each loader sets its global
 * when appended, and the replay stub records every `stop()` call.
 */
const probeDatabuddyScripts = function probeDatabuddyScripts() {
	const loaderScripts: HTMLScriptElement[] = [];
	const replayScripts: HTMLScriptElement[] = [];
	const stop = vi.fn(() => {
		delete (window as TestWindow).databuddyReplay;
	});
	installHeadProbe((node, win) => {
		if (isDatabuddyLoader(node)) {
			loaderScripts.push(node);
			win.databuddy = { options: {} };
			node.dispatchEvent(new Event('load'));
		}
		if (isReplayLoader(node)) {
			replayScripts.push(node);
			win.databuddyReplay = { stop };
		}
	});
	return { loaderScripts, replayScripts, stop };
};

describe('databuddy contract', () => {
	registerVendorContractCleanup();

	it('loads nothing until measurement consent is granted', () => {
		let loads = 0;
		installHeadProbe((node) => {
			if (isDatabuddyLoader(node)) {
				loads += 1;
			}
		});

		const script = databuddy({ clientId: 'db-contract' });

		expect(loadScripts([script], ALL_DENIED)).toEqual([]);
		expect(loads).toBe(0);
		expect((window as TestWindow).databuddyConfig).toBeUndefined();
	});

	it('loads on grant, disables the tracker on refusal and loads again with the granted config', () => {
		const configWhenGranted = {
			clientId: 'db-contract',
			disabled: false,
			trackScreenViews: true,
		};
		const configAtLoad: unknown[] = [];
		let attributes: Record<string, string | null> | undefined;

		installHeadProbe((node, win) => {
			if (!isDatabuddyLoader(node)) {
				return;
			}

			configAtLoad.push({ ...(win.databuddyConfig ?? {}) });
			attributes = {
				apiUrl: node.getAttribute('data-api-url'),
				clientId: node.getAttribute('data-client-id'),
				crossorigin: node.getAttribute('crossorigin'),
				trackInteractions: node.getAttribute('data-track-interactions'),
				trackWebVitals: node.getAttribute('data-track-web-vitals'),
			};

			win.databuddy = {
				options: {},
			};

			node.dispatchEvent(new Event('load'));
		});

		const script = databuddy({
			clientId: 'db-contract',
			configWhenDenied: { clientId: 'db-contract', disabled: true },
			configWhenGranted,
			features: { interactions: false },
		});

		loadScripts([script], grantedMeasurementConsents);

		const win = window as TestWindow;
		expect(attributes).toEqual({
			apiUrl: 'https://basket.databuddy.cc',
			clientId: 'db-contract',
			crossorigin: 'anonymous',
			trackInteractions: 'false',
			trackWebVitals: null,
		});
		expect(win.databuddyConfig).toEqual(configWhenGranted);
		expect(win.databuddy?.options.disabled).toBe(false);

		updateScripts([script], ALL_DENIED);

		expect(win.databuddy?.options.disabled).toBe(true);

		updateScripts([script], grantedMeasurementConsents);

		// The script a later grant loads starts with the granted config.
		expect(configAtLoad).toEqual([configWhenGranted, configWhenGranted]);
		expect(win.databuddy?.options.disabled).toBe(false);
		expect(win.databuddyConfig).toEqual(configWhenGranted);
	});

	it('disables the config when consent is refused while databuddy.js downloads', () => {
		const configAtLoad: unknown[] = [];
		installHeadProbe((node, win) => {
			if (isDatabuddyLoader(node)) {
				// Never fire `load`: the download is still in flight.
				configAtLoad.push({ ...(win.databuddyConfig ?? {}) });
			}
		});

		const script = databuddy({
			clientId: 'db-contract',
			configWhenGranted: { clientId: 'db-contract', trackScreenViews: true },
		});

		loadScripts([script], grantedMeasurementConsents);
		updateScripts([script], ALL_DENIED);

		// databuddy.js can still run after its <script> is removed, and it reads
		// this config when it does.
		const win = window as TestWindow;
		expect(win.databuddyConfig).toEqual({
			clientId: 'db-contract',
			disabled: true,
			trackScreenViews: true,
		});

		updateScripts([script], grantedMeasurementConsents);

		expect(configAtLoad).toEqual([
			{ clientId: 'db-contract', disabled: false, trackScreenViews: true },
			{ clientId: 'db-contract', disabled: false, trackScreenViews: true },
		]);
	});

	it('seeds the client ID and API URL for a loader URL without /databuddy.js', () => {
		let configAtLoad: unknown;
		installHeadProbe((node, win) => {
			if (node.src === 'https://example.com/stats.js') {
				configAtLoad = { ...(win.databuddyConfig ?? {}) };
			}
		});

		const script = databuddy({
			apiUrl: 'https://example.com/collect',
			clientId: 'db-contract',
			scriptUrl: 'https://example.com/stats.js',
		});

		loadScripts([script], grantedMeasurementConsents);

		// Databuddy falls back to this config when it cannot find its script tag.
		expect(configAtLoad).toEqual({
			apiUrl: 'https://example.com/collect',
			clientId: 'db-contract',
			disabled: false,
		});
	});

	it('boots with denied defaults when always loaded and then flips to granted', () => {
		const configWhenGranted = {
			clientId: 'db-contract',
			disabled: false,
			trackScreenViews: true,
		};
		const configWhenDenied = {
			clientId: 'db-contract',
			disabled: true,
		};
		let initialConfig: Record<string, unknown> | undefined;

		installHeadProbe((node, win) => {
			if (!isDatabuddyLoader(node)) {
				return;
			}

			initialConfig = { ...(win.databuddyConfig ?? {}) };

			win.databuddy = {
				options: {},
			};

			node.dispatchEvent(new Event('load'));
		});

		const script = {
			...databuddy({
				clientId: 'db-contract',
				configWhenDenied,
				configWhenGranted,
				loadMode: 'always',
			}),
			id: 'databuddy-contract',
		};

		loadScripts([script], ALL_DENIED);

		const win = window as TestWindow;
		expect(initialConfig).toEqual(configWhenDenied);
		expect(win.databuddy?.options.disabled).toBe(true);

		loadScripts([script], grantedMeasurementConsents);

		expect(win.databuddyConfig).toEqual(configWhenGranted);
		expect(win.databuddy?.options.disabled).toBe(false);
	});

	it('does not load replay.js without the replay option', () => {
		const { replayScripts } = probeDatabuddyScripts();

		loadScripts(
			[databuddy({ clientId: 'db-contract' })],
			grantedMeasurementConsents
		);

		expect(replayScripts).toEqual([]);
	});

	it('loads replay.js on grant, stops it on refusal and loads it again on a later grant', () => {
		const { replayScripts, stop } = probeDatabuddyScripts();
		const script = databuddy({
			apiUrl: 'https://example.com/collect',
			clientId: 'db-contract',
			replay: { maskText: false },
		});

		loadScripts([script], ALL_DENIED);
		expect(replayScripts).toEqual([]);

		updateScripts([script], grantedMeasurementConsents);

		const [replayScript] = replayScripts;
		expect(replayScripts).toHaveLength(1);
		expect(replayScript?.isConnected).toBe(true);
		expect({
			apiUrl: replayScript?.getAttribute('data-api-url'),
			clientId: replayScript?.getAttribute('data-client-id'),
			crossorigin: replayScript?.getAttribute('crossorigin'),
			maskText: replayScript?.getAttribute('data-mask-text'),
			recordIframes: replayScript?.getAttribute('data-record-iframes'),
		}).toEqual({
			apiUrl: 'https://example.com/collect',
			clientId: 'db-contract',
			crossorigin: 'anonymous',
			maskText: 'false',
			recordIframes: null,
		});

		updateScripts([script], ALL_DENIED);

		expect(stop).toHaveBeenCalledTimes(1);
		expect(replayScript?.isConnected).toBe(false);
		expect((window as TestWindow).databuddyReplay).toBeUndefined();

		updateScripts([script], grantedMeasurementConsents);

		expect(replayScripts).toHaveLength(2);
		expect(replayScripts[1]?.isConnected).toBe(true);
	});

	it('waits for consent before loading replay.js when Databuddy always loads', () => {
		const { replayScripts, stop } = probeDatabuddyScripts();
		const script = databuddy({
			clientId: 'db-contract',
			loadMode: 'always',
			replay: true,
		});

		loadScripts([script], ALL_DENIED);

		const win = window as TestWindow;
		expect(win.databuddy?.options.disabled).toBe(true);
		expect(replayScripts).toEqual([]);

		updateScripts([script], grantedMeasurementConsents);

		expect(replayScripts).toHaveLength(1);
		expect(replayScripts[0]?.hasAttribute('data-mask-text')).toBe(false);

		updateScripts([script], ALL_DENIED);

		expect(stop).toHaveBeenCalledTimes(1);
		expect(replayScripts[0]?.isConnected).toBe(false);
		expect(win.databuddy?.options.disabled).toBe(true);
	});

	it('stops replay.js when its loader is disposed', () => {
		const { replayScripts, stop } = probeDatabuddyScripts();

		loadScripts(
			[databuddy({ clientId: 'db-dispose', replay: true })],
			grantedMeasurementConsents
		);
		expect(replayScripts[0]?.isConnected).toBe(true);

		clearAllScripts();

		expect(stop).toHaveBeenCalledTimes(1);
		expect(replayScripts[0]?.isConnected).toBe(false);
	});

	it('stops replay.js when the replay option is turned off', () => {
		const { replayScripts, stop } = probeDatabuddyScripts();

		loadScripts(
			[databuddy({ clientId: 'db-toggle', replay: true })],
			grantedMeasurementConsents
		);
		updateScripts(
			[databuddy({ clientId: 'db-toggle' })],
			grantedMeasurementConsents
		);

		expect(stop).toHaveBeenCalledTimes(1);
		expect(replayScripts[0]?.isConnected).toBe(false);
	});

	it.each([
		[
			'the unversioned file without integrity by default',
			{},
			{ integrity: null, src: 'https://cdn.databuddy.cc/replay.js' },
		],
		[
			'a known pinned release with its integrity',
			{ version: '2026-10-30.1' },
			{
				integrity:
					'sha384-naub2msIlvDqEZRXGKjjR1CEOa9ZNszRcSgfitF8vO2qgKGlygxmOkxzH/puniCl',
				src: 'https://cdn.databuddy.cc/replay.2026-10-30.1.js',
			},
		],
		[
			'another pinned release, without integrity',
			{ version: '2026-11-14.1' },
			{
				integrity: null,
				src: 'https://cdn.databuddy.cc/replay.2026-11-14.1.js',
			},
		],
		[
			'replay.scriptUrl over version, without integrity',
			{
				replay: { scriptUrl: 'https://cdn.databuddy.cc/replay.custom.js' },
				version: '2026-10-30.1',
			},
			{ integrity: null, src: 'https://cdn.databuddy.cc/replay.custom.js' },
		],
		[
			'the pinned release when replay.scriptUrl is blank',
			{ replay: { scriptUrl: '  ' }, version: '2026-10-30.1' },
			{
				integrity:
					'sha384-naub2msIlvDqEZRXGKjjR1CEOa9ZNszRcSgfitF8vO2qgKGlygxmOkxzH/puniCl',
				src: 'https://cdn.databuddy.cc/replay.2026-10-30.1.js',
			},
		],
	])('loads replay.js from %s', (_name, options, expected) => {
		const { replayScripts } = probeDatabuddyScripts();

		loadScripts(
			[databuddy({ clientId: 'db-contract', replay: true, ...options })],
			grantedMeasurementConsents
		);

		expect({
			integrity: replayScripts[0]?.getAttribute('integrity') ?? null,
			src: replayScripts[0]?.getAttribute('src') ?? null,
		}).toEqual(expected);
	});

	it('keeps both scripts running when equal options are passed again', () => {
		const { loaderScripts, replayScripts, stop } = probeDatabuddyScripts();
		const options = { clientId: 'db-rerender', replay: { maskText: false } };

		loadScripts([databuddy(options)], grantedMeasurementConsents);
		updateScripts(
			[databuddy({ ...options, replay: { maskText: false } })],
			grantedMeasurementConsents
		);

		expect(loaderScripts).toHaveLength(1);
		expect(replayScripts).toHaveLength(1);
		expect(replayScripts[0]?.isConnected).toBe(true);
		expect(stop).not.toHaveBeenCalled();
	});
});

describe.each(npmAndRemote('databuddy', databuddy))(
	'databuddy dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('loads the pinned release before consent with its feature switches, disabled until measurement is granted', async () => {
			const { loaderScripts } = probeDatabuddyScripts();
			const scripts = [
				build({
					clientId: 'db_contract',
					features: {
						errors: true,
						interactions: false,
						outgoingLinks: false,
						webVitals: true,
					},
					loadMode: 'always',
					version: '2026-10-30.1',
				}),
			];
			loadScripts(scripts, ALL_DENIED);
			await settleScripts();

			const [loader] = loaderScripts;
			expect(loader?.src).toBe(
				'https://cdn.databuddy.cc/databuddy.2026-10-30.1.js'
			);
			expect(loader?.getAttribute('integrity')).toMatch(/^sha384-/u);
			expect(loader?.dataset).toMatchObject({
				clientId: 'db_contract',
				trackErrors: 'true',
				trackInteractions: 'false',
				trackOutgoingLinks: 'false',
				trackWebVitals: 'true',
			});
			const win = window as TestWindow;
			expect(win.databuddyConfig).toMatchObject({ disabled: true });
			expect(win.databuddy?.options.disabled).toBe(true);

			updateScripts(scripts, grantedMeasurementConsents);
			expect(win.databuddyConfig).toMatchObject({ disabled: false });
			expect(win.databuddy?.options.disabled).toBe(false);
		});

		it('loads replay.js without an id once measurement is granted, and stops it on refusal', async () => {
			const { replayScripts, stop } = probeDatabuddyScripts();
			const scripts = [
				build({
					clientId: 'db_contract',
					replay: { maskText: false, recordIframes: true },
					version: '2026-10-30.1',
				}),
			];
			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(replayScripts).toEqual([]);

			updateScripts(scripts, grantedMeasurementConsents);
			const [replay] = replayScripts;
			expect(replayScripts).toHaveLength(1);
			expect(replay?.src).toBe(
				'https://cdn.databuddy.cc/replay.2026-10-30.1.js'
			);
			expect(replay?.hasAttribute('id')).toBe(false);
			expect(replay?.getAttribute('integrity')).toMatch(/^sha384-/u);
			expect(replay?.dataset).toMatchObject({
				apiUrl: 'https://basket.databuddy.cc',
				clientId: 'db_contract',
				maskText: 'false',
				recordIframes: 'true',
			});

			updateScripts(scripts, ALL_DENIED);
			expect(stop).toHaveBeenCalledTimes(1);
			expect(replay?.isConnected).toBe(false);
		});
	}
);

describe('databuddy session replay from the Inth server', () => {
	registerVendorContractCleanup();

	it('keeps one recorder running when a changed manifest replaces the registration', async () => {
		const { replayScripts, stop } = probeDatabuddyScripts();
		// Each call builds a fresh script, as the remote loader does when the
		// manifest it receives changes.
		const build = await remoteTraceFactory('databuddy', {
			clientId: 'db_contract',
			replay: { maskText: true, recordIframes: false },
		})();
		const kernel = createConsentKernel();
		await kernel.commands.save(grantedMeasurementConsents);
		const loader = createScriptLoader({
			kernel,
			scripts: [build(undefined as never)],
		});
		try {
			expect(replayScripts).toHaveLength(1);

			loader.updateScripts([build(undefined as never)]);

			// The incoming registration finds the recorder running, and the
			// outgoing one's dispose leaves it to the incoming one.
			expect(replayScripts).toHaveLength(1);
			expect(replayScripts[0]?.isConnected).toBe(true);
			expect(stop).not.toHaveBeenCalled();

			await kernel.commands.save(ALL_DENIED);
			expect(stop).toHaveBeenCalledTimes(1);
			expect(replayScripts[0]?.isConnected).toBe(false);
		} finally {
			loader.dispose();
			kernel.dispose();
		}
	});

	it('keeps one recorder running while a replacement for another setting still downloads', async () => {
		const loaderScripts: HTMLScriptElement[] = [];
		const replayScripts: HTMLScriptElement[] = [];
		const stop = vi.fn(() => {
			delete (window as TestWindow).databuddyReplay;
		});
		// The test fires each databuddy.js load itself, so a replacement's
		// file can still be downloading when the outgoing one lets go.
		installHeadProbe((node, win) => {
			if (isDatabuddyLoader(node)) {
				loaderScripts.push(node);
				win.databuddy = { options: {} };
			}
			if (isReplayLoader(node)) {
				replayScripts.push(node);
				win.databuddyReplay = { stop };
			}
		});
		const options = {
			clientId: 'db_contract',
			replay: { maskText: true, recordIframes: false },
		};
		const first = await remoteTraceFactory('databuddy', options)();
		const second = await remoteTraceFactory('databuddy', {
			...options,
			features: { webVitals: true },
		})();
		const kernel = createConsentKernel();
		await kernel.commands.save(grantedMeasurementConsents);
		const loader = createScriptLoader({
			kernel,
			scripts: [first(undefined as never)],
		});
		try {
			loaderScripts[0]?.dispatchEvent(new Event('load'));
			expect(replayScripts).toHaveLength(1);

			loader.updateScripts([second(undefined as never)]);

			expect(loaderScripts).toHaveLength(2);
			expect(replayScripts[0]?.isConnected).toBe(true);
			expect(stop).not.toHaveBeenCalled();

			loaderScripts[1]?.dispatchEvent(new Event('load'));

			expect(replayScripts).toHaveLength(1);
			expect(replayScripts[0]?.isConnected).toBe(true);
			expect(stop).not.toHaveBeenCalled();

			await kernel.commands.save(ALL_DENIED);
			expect(stop).toHaveBeenCalledTimes(1);
			expect(replayScripts[0]?.isConnected).toBe(false);
		} finally {
			loader.dispose();
			kernel.dispose();
		}
	});

	it('stops the recorder when the replacement tracker fails to load', async () => {
		const loaderScripts: HTMLScriptElement[] = [];
		const replayScripts: HTMLScriptElement[] = [];
		const stop = vi.fn(() => {
			delete (window as TestWindow).databuddyReplay;
		});
		installHeadProbe((node, win) => {
			if (isDatabuddyLoader(node)) {
				loaderScripts.push(node);
				win.databuddy = { options: {} };
			}
			if (isReplayLoader(node)) {
				replayScripts.push(node);
				win.databuddyReplay = { stop };
			}
		});
		const options = {
			clientId: 'db_contract',
			replay: { maskText: true, recordIframes: false },
		};
		const first = await remoteTraceFactory('databuddy', options)();
		const second = await remoteTraceFactory('databuddy', {
			...options,
			features: { webVitals: true },
		})();
		const kernel = createConsentKernel();
		await kernel.commands.save(grantedMeasurementConsents);
		const loader = createScriptLoader({
			kernel,
			scripts: [first(undefined as never)],
		});
		try {
			loaderScripts[0]?.dispatchEvent(new Event('load'));
			loader.updateScripts([second(undefined as never)]);

			loaderScripts[1]?.dispatchEvent(new Event('error'));

			expect(stop).toHaveBeenCalledTimes(1);
			expect(replayScripts[0]?.isConnected).toBe(false);
		} finally {
			loader.dispose();
			kernel.dispose();
		}
	});

	it('stops the recorder when the replacement comes with a withdrawal', async () => {
		const { replayScripts, stop } = probeDatabuddyScripts();
		const build = await remoteTraceFactory('databuddy', {
			clientId: 'db_contract',
			replay: { maskText: true, recordIframes: false },
		})();
		const kernel = createConsentKernel();
		await kernel.commands.save(grantedMeasurementConsents);
		const loader = createScriptLoader({
			kernel,
			scripts: [build(undefined as never)],
		});
		try {
			const withdrawn = kernel.commands.save(ALL_DENIED);
			loader.updateScripts([build(undefined as never)]);
			await withdrawn;

			expect(stop).toHaveBeenCalledTimes(1);
			expect(replayScripts).toHaveLength(1);
			expect(replayScripts[0]?.isConnected).toBe(false);
		} finally {
			loader.dispose();
			kernel.dispose();
		}
	});
});
