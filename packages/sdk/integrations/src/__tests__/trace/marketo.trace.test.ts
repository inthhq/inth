/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/marketo'));

// The manifest the Inth server sends, after a JSON round trip. Its
// "load after the element was removed" row passes without the helper's old
// connected-element check: the loader never completes a removed element.
await describeGoldenTraces(() => import('./specs/marketo'), {
	factory: remoteTraceFactory('marketoMunchkin', {
		initOptions: { asyncOnly: true },
		munchkinId: '123-ABC-456',
	}),
});
