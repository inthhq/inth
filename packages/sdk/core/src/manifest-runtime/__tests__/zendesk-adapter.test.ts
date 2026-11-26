/**
 * @vitest-environment jsdom
 *
 * The Zendesk adapter takes no options: the manifest carries the widget
 * key in its snippet URL. Its lifecycle runs in `@inth/integrations`'
 * Zendesk e2e suite and traces.
 */
import { describe, expect, it } from 'vite-plus/test';

import { zendeskAdapter } from '../adapters/zendesk';

describe('the Zendesk adapter', () => {
	it('accepts no options', () => {
		expect(zendeskAdapter.problem({})).toBeUndefined();
		expect(zendeskAdapter.problem({ key: 'widget-key' })).toBe(
			'it has the unknown option key'
		);
	});

	it('drops the base script server start and keeps its fields', () => {
		const script = zendeskAdapter.script(
			{
				category: 'functionality',
				id: 'zendesk',
				serverStart: () => undefined,
				src: 'https://static.zdassets.com/ekr/snippet.js?key=k',
			},
			{}
		);

		expect(script.serverStart).toBeUndefined();
		expect(script.src).toBe('https://static.zdassets.com/ekr/snippet.js?key=k');
	});
});
