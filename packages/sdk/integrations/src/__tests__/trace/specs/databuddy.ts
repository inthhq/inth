import { databuddy } from '../../../vendors/analytics/databuddy';
import type { TraceSpec, TraceStubs } from '../harness';

const noop = () => undefined;

// databuddy.js builds its tracker from `databuddyConfig`; the replay file
// installs `databuddyReplay`.
const runFile = (src: string, stubs: TraceStubs) => {
	if (src.includes('/replay')) {
		stubs.install(
			'databuddyReplay',
			stubs.api('databuddyReplay', { stop: noop })
		);
		return;
	}
	const config = stubs.win.databuddyConfig as
		| { disabled?: boolean }
		| undefined;
	stubs.install(
		'databuddy',
		stubs.api('databuddy', {
			clear: noop,
			flush: noop,
			options: { disabled: config?.disabled === true },
			track: noop,
		})
	);
};

export const databuddyTrace: TraceSpec = {
	granted: { measurement: true },
	name: 'databuddy',
	onFileLoad: runFile,
	script: () =>
		databuddy({
			clientId: 'client-id',
			features: { interactions: true, webVitals: false },
			version: '2026-10-30.1',
		}),
};

/** With session replay, which inserts and removes its own file. */
export const databuddyReplayTrace: TraceSpec = {
	granted: { measurement: true },
	name: 'databuddy.replay',
	onFileLoad: runFile,
	script: () =>
		databuddy({
			clientId: 'client-id',
			replay: { maskText: true },
			version: '2026-10-30.1',
		}),
};

/** With session replay as a dashboard form sends it, every switch set. */
export const databuddyReplayDashboardTrace: TraceSpec = {
	...databuddyReplayTrace,
	name: 'databuddy.replay-dashboard',
	script: () =>
		databuddy({
			clientId: 'client-id',
			replay: { maskText: true, recordIframes: false },
			version: '2026-10-30.1',
		}),
};

/** With every feature switch set, as a dashboard form sends them. */
export const databuddyDashboardTrace: TraceSpec = {
	...databuddyTrace,
	name: 'databuddy.dashboard',
	script: () =>
		databuddy({
			clientId: 'client-id',
			features: {
				errors: true,
				interactions: false,
				outgoingLinks: false,
				webVitals: true,
			},
			version: '2026-10-30.1',
		}),
};

/** Loaded before consent, with the tracker disabled until a grant. */
export const databuddyAlwaysTrace: TraceSpec = {
	...databuddyTrace,
	name: 'databuddy.always',
	script: () => databuddy({ clientId: 'client-id', loadMode: 'always' }),
};

export const traces = [
	databuddyTrace,
	databuddyReplayTrace,
	databuddyReplayDashboardTrace,
	databuddyDashboardTrace,
	databuddyAlwaysTrace,
];
