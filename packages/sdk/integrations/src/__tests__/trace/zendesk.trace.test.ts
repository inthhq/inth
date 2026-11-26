/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/zendesk'));

/**
 * The same trace from the manifest the Inth server sends for the widget
 * key. The helper returns one script for equal options, and the loader
 * keeps the script it built while the manifest is unchanged.
 */
await describeGoldenTraces(() => import('./specs/zendesk'), {
	factory: remoteTraceFactory(
		'zendeskWidget',
		{ key: 'widget-key' },
		{ keepScript: true }
	),
});
