/**
 * A custom server render with `renderToString`, which cannot wait for a
 * chunk: the banner's containers load first with `await preloadContainers()`.
 */
import { renderToString } from 'react-dom/server';
import { expect, test } from 'vitest';

import { ConsentBanner, preloadContainers } from '../components/prompt/index';
import { InthProvider } from '../provider';
import { testing } from '../testing';
import { policyFixture } from './policy-fixture';

const page = () =>
	renderToString(
		<InthProvider
			options={{
				mode: testing(),
				persistence: false,
				prefetch: policyFixture(undefined, { model: 'opt-in' }),
			}}
		>
			<ConsentBanner />
		</InthProvider>
	);

test('after await preloadContainers(), a synchronous server render has the banner', async () => {
	await preloadContainers();
	expect(page()).toContain('data-testid="consent-banner-root"');
});
