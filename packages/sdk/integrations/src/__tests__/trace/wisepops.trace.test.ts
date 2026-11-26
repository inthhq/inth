/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/wisepops'));

// The manifest the Inth server sends, after a JSON round trip.
await describeGoldenTraces(() => import('./specs/wisepops'), {
	factory: remoteTraceFactory('wisepops', {
		options: { autoPageview: 'url' },
		siteId: 'site-id',
	}),
});
