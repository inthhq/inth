/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/vercel-speed-insights'));

// The manifest the Inth server sends, after a JSON round trip, with the
// consent gate as the collector's beforeSend. A site's own beforeSend is
// npm-only, so that trace runs only for the helper.
await describeGoldenTraces(() => import('./specs/vercel-speed-insights'), {
	factory: remoteTraceFactory('vercelSpeedInsights', { sampleRate: 0.5 }),
	names: ['vercel-speed-insights'],
});
