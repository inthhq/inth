/**
 * A server render of `InthProvider` finds the engine already loaded: a
 * synchronous `renderToString` right after the import does not suspend.
 * Browser bundles resolve `#engine-now` to a stub and load the engine with
 * `import()` instead.
 */
import { renderToString } from 'react-dom/server';
import { afterAll, expect, test, vi } from 'vitest';

import {
	choiceRecords,
	matchedResolution,
	NOW,
	optInRule,
} from '../../../core/src/__tests__/fixtures/kernel-fixtures';
import { InthProvider } from '../inth-provider';
import { transportMode } from './fixtures/transport-mode';

// The engine starts loading the server start's module as it is imported, and
// a fast machine finishes that before the test runs. Hold the module until
// the test ends, so the render below is one that comes before it loads.
const serverStart = vi.hoisted(() => {
	let release: () => void = () => undefined;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { held, release: () => release() };
});
// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is a render before this chunk loads; nothing else can hold a dynamic import pending. The factory returns the real module once the test ends.
vi.mock('@inth/sdk/runtime/script-server-start', async (importOriginal) => {
	await serverStart.held;
	return importOriginal();
});
afterAll(() => {
	serverStart.release();
});

test('renderToString of InthProvider right after its import does not suspend', () => {
	const resolution = matchedResolution(optInRule());
	const html = renderToString(
		<InthProvider
			options={{ mode: transportMode({ init: () => Promise.resolve({}) }) }}
			// A root script with a server start, whose code is in the module
			// that is still loading.
			scripts={[
				{
					category: 'marketing',
					id: 'pixel',
					serverStart: () => ({ code: '' }),
					src: 'https://cdn.example.com/pixel.js',
				},
			]}
			state={{
				initialPolicyResolution: resolution,
				initialRecords: choiceRecords(
					{ marketing: true },
					{
						confirmedAt: NOW - 1000,
						fingerprint: resolution.fingerprints.choice,
					}
				),
				now: NOW,
			}}
		>
			<main id="page">Page</main>
		</InthProvider>
	);
	expect(html).toContain('<main id="page">Page</main>');
	// The first render in the process: the boot data may not share a
	// boundary with anything that suspends on a module still loading, or
	// React leaves it to the browser and a deferred root reads none.
	expect(html).toContain('data-inth-boot');
	// Only the server start, in its own boundary, is left to the browser.
	expect(html.split('<!--$!-->')).toHaveLength(2);
	// Without the module there is no start script, so the boot data names a
	// render the page has no marks for: the root cannot count the script as
	// started, and loads the engine for it.
	const boot = /<script[^>]*data-inth-boot[^>]*>(?<data>[^<]*)<\/script>/u.exec(
		html
	);
	expect(JSON.parse(boot?.groups?.data ?? '{}').i).toEqual(expect.any(String));
});
