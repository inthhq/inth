/**
 * A server render of `ConsentRoot` finds the engine already loaded: a
 * synchronous `renderToString` right after the import does not suspend.
 * Browser bundles resolve `#engine-now` to a stub and load the engine with
 * `import()` instead.
 */
import { custom } from '@c15t/react';
import { renderToString } from 'react-dom/server';
import { expect, test } from 'vitest';

import {
	choiceRecords,
	matchedResolution,
	NOW,
	optInRule,
} from '../../../core/src/__tests__/fixtures/kernel-fixtures';
import { ConsentRoot } from '../root';

test('renderToString of ConsentRoot right after its import does not suspend', () => {
	const resolution = matchedResolution(optInRule());
	const html = renderToString(
		<ConsentRoot
			options={{ mode: custom({ init: () => Promise.resolve({}) }) }}
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
		</ConsentRoot>
	);
	expect(html).toContain('<main id="page">Page</main>');
	// The first render in the process: the boot data may not share a
	// boundary with anything that suspends on a module still loading, or
	// React leaves it to the browser and a deferred root reads none.
	expect(html).toContain('data-c15t-boot');
	// Only the server start, in its own boundary, is left to the browser.
	expect(html.split('<!--$!-->')).toHaveLength(2);
	// Without the module there is no start script, so the boot data names a
	// render the page has no marks for: the root cannot count the script as
	// started, and loads the engine for it.
	const boot = /<script[^>]*data-c15t-boot[^>]*>(?<data>[^<]*)<\/script>/u.exec(
		html
	);
	expect(JSON.parse(boot?.groups?.data ?? '{}').i).toEqual(expect.any(String));
});
