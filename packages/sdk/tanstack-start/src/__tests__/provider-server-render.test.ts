/**
 * In the browser, a hosted `InthProvider` with nothing prefetched sends
 * `/v1/consent/init` from its first render. A server render must not: the request
 * belongs to the visitor's browser, and a server has no runtime to apply
 * the answer to.
 */
import { InthProvider } from '@inth/react/provider';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, test, vi } from 'vite-plus/test';

test('a server render of a hosted provider sends no /v1/consent/init', () => {
	const fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	const html = renderToString(
		createElement(
			InthProvider,
			{
				options: {
					projectUrl: 'https://consent.example/api/inth',
				},
			},
			createElement('main', null, 'Shell')
		)
	);
	expect(html).toContain('Shell');
	expect(fetch).not.toHaveBeenCalled();
	vi.unstubAllGlobals();
});
