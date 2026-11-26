/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/front-chat'));

// The manifest the Inth server sends, after a JSON round trip.
await describeGoldenTraces(() => import('./specs/front-chat'), {
	factory: remoteTraceFactory('frontChat', { chatId: 'chat-id' }),
});
