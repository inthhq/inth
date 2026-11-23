/**
 * TanStack Start leaves no engine preload in the HTML. Vite's native
 * `import()` adds no `<script>` elements for the browser to learn the
 * engine's chunks from; a recording caught only the consent-gated vendor
 * scripts Inth started meanwhile, which a preload then fetched on later
 * visits, even after the visitor rejected them.
 */
import { manifest } from '@inth/sdk/modes';
import { createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { expect, test } from 'vitest';

import {
	optInRule,
	optOutRule,
} from '../../../core/src/__tests__/fixtures/kernel-fixtures';
import { InthProvider } from '../inth-provider';
import type { InthProviderProps } from '../inth-provider';
import { resolveConsent } from '../server';
import { manifestOf } from './manifest-fixture';

const render = async (
	rule: ReturnType<typeof optInRule>,
	props: Partial<InthProviderProps> = {}
): Promise<string> => {
	const state = await resolveConsent({
		mode: manifest(),
		// A relative backend is the app's own route: no session report.
		projectUrl: '/api/inth',
		request: new Request('https://app.example.com/'),
		snapshot: manifestOf([rule]),
	});
	const stream = await renderToReadableStream(
		createElement(
			InthProvider,
			{ ...props, state },
			createElement('main', { id: 'page' }, 'Page')
		)
	);
	await stream.allReady;
	return new Response(stream).text();
};

test('no root leaves an engine preload, even one the engine must serve at once', async () => {
	const pages = [
		// A banner asking to choose: the engine can wait.
		await render(optInRule()),
		// Everything granted: the engine loads at once.
		await render(optOutRule()),
		// A network blocker needs the engine from the first render.
		await render(optInRule(), { networkBlocker: { rules: [] } }),
	];
	for (const html of pages) {
		expect(html).toContain('data-inth-boot');
		expect(html).not.toContain('inth-engine-chunks');
	}
});
