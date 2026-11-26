/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/salesforce-pardot'));

// Classic mode through the manifest the Inth server sends, after a JSON
// round trip. Consent mode stays on the helper until its adapter.
await describeGoldenTraces(() => import('./specs/salesforce-pardot'), {
	factory: remoteTraceFactory('pardotTracking', {
		mode: 'classic',
		piAId: '123456',
		piCId: '654321',
	}),
	names: ['salesforce-pardot.classic'],
});
