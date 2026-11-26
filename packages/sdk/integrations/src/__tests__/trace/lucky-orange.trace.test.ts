/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/lucky-orange'));

/**
 * The same trace from the manifest the Inth server sends for the site ID.
 * The runtime loads the Lucky Orange adapter the manifest names before it
 * parses and builds it.
 */
await describeGoldenTraces(() => import('./specs/lucky-orange'), {
	// The loader keeps the script an entry built while its manifest is
	// unchanged, so a replacement with the same entry gets the same script.
	factory: remoteTraceFactory(
		'luckyOrange',
		{ siteId: 'site-id' },
		{ keepScript: true }
	),
});
