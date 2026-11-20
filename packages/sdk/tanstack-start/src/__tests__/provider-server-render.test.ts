/**
 * In the browser, a hosted `ConsentProvider` with nothing prefetched sends
 * `/init` from its first render. A server render must not: the request
 * belongs to the visitor's browser, and a server has no runtime to apply
 * the answer to.
 */
import { ConsentProvider } from '@inth/react/provider';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

test('a server render of a hosted provider sends no /v1/consent/init', () => {
	const fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	const html = renderToString(
		createElement(
			ConsentProvider,
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
