/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/databuddy'));

// The manifest the Inth server sends, after a JSON round trip, for the
// specs a dashboard can set. A dashboard form sends every feature switch.
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

/**
 * Session replay, which names the Databuddy adapter, with every replay
 * switch a dashboard form sends. The runtime loads the adapter before it
 * parses and builds the manifest.
 */
await describeGoldenTraces(() => import('./specs/databuddy'), {
	// The loader keeps the script an entry built while its manifest is
	// unchanged, so a replacement with the same entry gets the same script.
	factory: remoteTraceFactory(
		'databuddy',
		{
			clientId: 'client-id',
			replay: { maskText: true, recordIframes: false },
			version: '2026-10-30.1',
		},
		{ keepScript: true }
	),
	names: ['databuddy.replay-dashboard'],
});
