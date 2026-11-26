/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/gorgias'));

/**
 * The same traces, the old-promise and pending-init ones too, from the
 * manifest the Inth server sends for the app key. The runtime loads the
 * Gorgias adapter the manifest names before it parses and builds it.
 */
await describeGoldenTraces(() => import('./specs/gorgias'), {
	factory: remoteTraceFactory('gorgiasChat', { appKey: 'app-key' }),
});
