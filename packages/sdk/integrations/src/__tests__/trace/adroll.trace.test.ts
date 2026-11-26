/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/adroll'));

// The manifest the Inth server sends, after a JSON round trip.
await describeGoldenTraces(() => import('./specs/adroll'), {
	factory: remoteTraceFactory('adrollPixel', {
		advertiserId: 'advertiser',
		pixelId: 'pixel',
	}),
});
