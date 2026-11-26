/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/sentry'));

/**
 * The same trace from the manifest the Inth server sends for the options in
 * the spec, a DSN in parts and the init options. The runtime loads the
 * Sentry adapter the manifest names before it parses and builds it.
 */
await describeGoldenTraces(() => import('./specs/sentry'), {
	// The loader keeps the script an entry built while its manifest is
	// unchanged, so a replacement with the same entry gets the same script.
	factory: remoteTraceFactory(
		'sentry',
		{
			initOptions: { release: 'trace@1.0.0', replaysSessionSampleRate: 1 },
			organizationId: '0',
			projectId: '0',
			publicKey: 'public',
		},
		{ keepScript: true }
	),
});
