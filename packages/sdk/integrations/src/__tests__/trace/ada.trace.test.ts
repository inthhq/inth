/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/ada'));

/**
 * The same traces from the manifest the Inth server sends for the spec's
 * options. The runtime loads the Ada adapter the manifest names before it
 * parses and builds it.
 */
await describeGoldenTraces(() => import('./specs/ada'), {
	factory: remoteTraceFactory('ada', { cluster: 'eu', handle: 'agent' }),
});
