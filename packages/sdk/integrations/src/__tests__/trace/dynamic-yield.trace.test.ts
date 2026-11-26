/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

await describeGoldenTraces(() => import('./specs/dynamic-yield'));

/**
 * The same trace from the manifest the Inth server sends for the options
 * a dashboard sets. The page context is npm-only. The helper returns one
 * script for equal options, and the loader keeps the script it built
 * while the manifest is unchanged.
 */
await describeGoldenTraces(() => import('./specs/dynamic-yield'), {
	factory: remoteTraceFactory(
		'dynamicYield',
		{ region: 'eu', sectionId: '8765432' },
		{ keepScript: true }
	),
	names: ['dynamic-yield.dashboard'],
});
