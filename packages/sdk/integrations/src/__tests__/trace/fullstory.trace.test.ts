/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/fullstory'));

/**
 * The same trace from the manifest the Inth server sends for the
 * organization and element consent. The runtime loads the FullStory adapter
 * the manifest names before it parses and builds it.
 */
await describeGoldenTraces(() => import('./specs/fullstory'), {
	// The loader keeps the script an entry built while its manifest is
	// unchanged, so a replacement with the same entry gets the same script.
	factory: remoteTraceFactory(
		'fullStory',
		{ elementConsent: true, orgId: 'o-TRACE-na1' },
		{ keepScript: true }
	),
});
