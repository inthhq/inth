import { luckyOrange } from '../../../vendors/analytics/lucky-orange';
import type { LuckyOrangeApi } from '../../../vendors/analytics/lucky-orange';
import type { TraceSpec } from '../harness';

type ReadyEntry = ['ready', (api: LuckyOrangeApi) => void];

// The file builds `LO`, runs the queued ready callbacks, and runs later
// ones as they are pushed.
export const luckyOrangeTrace: TraceSpec = {
	granted: { measurement: true },
	name: 'lucky-orange',
	onFileLoad(_src, stubs) {
		const api = stubs.api<LuckyOrangeApi>('LO', {
			$internal: { ready: () => Promise.resolve() },
			privacy: { setConsentStatus: () => undefined },
		});
		stubs.install('LO', api);
		const queued = (stubs.win.LOQ as ReadyEntry[] | undefined) ?? [];
		stubs.install('LOQ', {
			push: stubs.fn('LOQ.push', (entry) => {
				(entry as ReadyEntry)[1](api);
			}),
		});
		for (const [, onReady] of queued) {
			onReady(api);
		}
	},
	scenarios: [
		{
			name: 'revoke before the ready callback',
			start: 'granted',
			steps: ['deny', 'load', 'grant', 'dispose'],
		},
	],
	script: () => luckyOrange({ siteId: 'site-id' }),
};

export const traces = [luckyOrangeTrace];
