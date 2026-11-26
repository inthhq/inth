/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/databuddy'));

// The manifest the Inth server sends, after a JSON round trip, for the
// specs a dashboard can set. A dashboard form sends every feature switch,
// and `replay` is npm-only until its adapter.
await describeGoldenTraces(() => import('./specs/databuddy'), {
	factory: remoteTraceFactory('databuddy', {
		clientId: 'client-id',
		features: {
			errors: true,
			interactions: false,
			outgoingLinks: false,
			webVitals: true,
		},
		version: '2026-10-30.1',
	}),
	names: ['databuddy.dashboard'],
});

await describeGoldenTraces(() => import('./specs/databuddy'), {
	factory: remoteTraceFactory('databuddy', {
		clientId: 'client-id',
		loadMode: 'always',
	}),
	names: ['databuddy.always'],
});
