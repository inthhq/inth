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
});
