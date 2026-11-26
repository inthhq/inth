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

export const traces = [databuddyTrace, databuddyReplayTrace];
