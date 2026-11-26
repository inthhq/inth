import { adobeTarget } from '../../../vendors/functional/adobe-target';
import type { TraceSpec, TraceStubs } from '../harness';

const noop = () => undefined;

type AlloyQueueEntry = [
	resolve: (value: unknown) => void,
	reject: (reason?: unknown) => void,
	args: unknown[],
];

/** at.js, with the Visitor API's opt-in service already on the page. */
export const adobeTargetAtJsTrace: TraceSpec = {
	granted: { experience: true },
	name: 'adobe-target.atjs',
	script: () =>
		adobeTarget({
			mode: 'atjs',
			scriptUrl: 'https://assets.adobedtm.com/target/at.js',
			targetGlobalSettings: { bodyHidingEnabled: false, timeout: 3000 },
		}),
	setup(stubs) {
		stubs.install('adobe', {
			OptInCategories: { TARGET: 'target' },
			optIn: stubs.api('adobe.optIn', { approve: noop, deny: noop }),
		});
	},
};

// alloy.min.js replaces the queue function, answers what was queued, and
// answers later pushes to the stub's queue too, as Alloy's snippet expects.
const runAlloy = (_src: string, stubs: TraceStubs) => {
	const pending = stubs.win.alloy as { q?: AlloyQueueEntry[] } | undefined;
	const alloy = stubs.fn('alloy', () => Promise.resolve({}));
	const answer = ([resolve, reject, args]: AlloyQueueEntry) => {
		(alloy(...args) as Promise<unknown>).then(resolve).catch(reject);
		return 0;
	};
	stubs.install('alloy', alloy);
	const queue = pending?.q ?? [];
	for (const entry of queue.splice(0)) {
		answer(entry);
	}
	queue.push = (...entries: AlloyQueueEntry[]) => {
		for (const entry of entries) {
			answer(entry);
		}
		return 0;
	};
};

/** The Adobe Experience Platform Web SDK. */
export const adobeTargetWebSdkTrace: TraceSpec = {
	granted: { experience: true },
	name: 'adobe-target.websdk',
	onFileLoad: runAlloy,
	script: () =>
		adobeTarget({
			datastreamId: 'datastream-id',
			mode: 'websdk',
			orgId: 'ORG@AdobeOrg',
			version: '2.21.0',
		}),
};

export const traces = [adobeTargetAtJsTrace, adobeTargetWebSdkTrace];
