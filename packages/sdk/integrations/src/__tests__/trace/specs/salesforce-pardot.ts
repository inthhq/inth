import { pardotTracking } from '../../../vendors/analytics/salesforce-pardot';
import type { TraceSpec, TraceStubs } from '../harness';

// pdt.js replaces the queue stub with its dispatcher and replays `cq`, as
// the e2e suite's `executeSdk` does.
const runSdk = (_src: string, stubs: TraceStubs) => {
	const pending = stubs.win.pdt as { cq?: IArguments[] } | undefined;
	const queued = pending?.cq ?? [];
	const pdt = stubs.fn('pdt');
	stubs.install('pdt', pdt);
	for (const args of queued) {
		pdt(...Array.from(args));
	}
};

export const salesforcePardotTrace: TraceSpec = {
	granted: { marketing: true },
	name: 'salesforce-pardot',
	onFileLoad: runSdk,
	scenarios: [
		{
			name: 'in-flight download completes after withdrawal, then regrant',
			start: 'granted',
			steps: ['deny', 'load', 'grant', 'dispose'],
		},
		{
			name: 'in-flight download completes after regrant',
			start: 'granted',
			steps: ['deny', 'grant', 'load', 'dispose'],
		},
		{
			name: 'overlapping downloads: the new one completes first',
			start: 'granted',
			steps: ['remount', 'load', 'load-detached', 'deny', 'grant', 'dispose'],
		},
		{
			name: 'overlapping downloads: the disposed one completes first',
			start: 'granted',
			steps: [
				'remount',
				{
					label: 'the disposed download completes',
					async run(page) {
						const stale = page
							.pendingScripts()
							.find((element) => !element.isConnected);
						if (stale) {
							await page.completeLoad(stale);
						}
					},
				},
				'load',
				'deny',
				'grant',
				'dispose',
			],
		},
	],
	script: () =>
		pardotTracking({
			piAId: '123456',
			piCId: '654321',
			piDomain: 'go.example.com',
		}),
};

/** The classic snippet, with no consent stub. */
export const salesforcePardotClassicTrace: TraceSpec = {
	granted: { marketing: true },
	name: 'salesforce-pardot.classic',
	script: () =>
		pardotTracking({ mode: 'classic', piAId: '123456', piCId: '654321' }),
};

export const traces = [salesforcePardotTrace, salesforcePardotClassicTrace];
