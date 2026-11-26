/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/gainsight-px'));

/**
 * The same trace from the manifest the Inth server sends for the product
 * key, for the spec a dashboard can set: config, user and account stay in
 * the site's code. The runtime loads the Gainsight PX adapter the manifest
 * names before it parses and builds it.
 */
await describeGoldenTraces(() => import('./specs/gainsight-px'), {
	// The loader keeps the script an entry built while its manifest is
	// unchanged, so a replacement with the same entry gets the same script.
	factory: remoteTraceFactory(
		'gainsightPx',
		{ productKey: 'AP-PRODUCT-KEY' },
		{ keepScript: true }
	),
	names: ['gainsight-px.dashboard'],
});
