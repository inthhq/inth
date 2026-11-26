/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/appcues'));

// The manifest the Inth server sends, after a JSON round trip. `onReady`
// is npm-only, so its trace runs only for the helper.
await describeGoldenTraces(() => import('./specs/appcues'), {
	factory: remoteTraceFactory('appcues', {
		accountId: '12345',
		settings: { skipAMD: true },
	}),
	names: ['appcues'],
});
