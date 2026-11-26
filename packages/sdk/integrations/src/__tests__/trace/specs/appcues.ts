import { appcues } from '../../../vendors/functional/appcues';
import type { AppcuesOptions } from '../../../vendors/functional/appcues';
import type { TraceSpec, TraceStubs } from '../harness';

const noop = () => undefined;

const options: AppcuesOptions = {
	accountId: '12345',
	settings: { skipAMD: true },
};

const installAppcues = (_src: string, stubs: TraceStubs) => {
	stubs.install(
		'Appcues',
		stubs.api('Appcues', {
			anonymous: noop,
			identify: noop,
			page: noop,
			reset: noop,
		})
	);
};

export const appcuesTrace: TraceSpec = {
	granted: { experience: true },
	name: 'appcues',
	onFileLoad: installAppcues,
	script: () => appcues(options),
};

/** With the npm-only `onReady` callback. */
export const appcuesOnReadyTrace: TraceSpec = {
	granted: { experience: true },
	name: 'appcues.on-ready',
	onFileLoad: installAppcues,
	script: (stubs) => appcues({ ...options, onReady: stubs.fn('onReady') }),
};

export const traces = [appcuesTrace, appcuesOnReadyTrace];
