/**
 * On the server the deferred island must render its module at once: the
 * banner's HTML is what paints at first contentful paint.
 */
import { renderToReadableStream } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

import { DEFER_CAPTURE_SCRIPT, deferConsent } from '../defer';

test('the server renders the module and the capture script', async () => {
	const Inner = ({ label }: { label: string }) => (
		<button
			data-testid="inside"
			type="button"
		>
			{label}
		</button>
	);
	const load = vi.fn(() => Promise.resolve({ default: Inner }));
	const Island = deferConsent(load);

	const stream = await renderToReadableStream(<Island label="Accept" />);
	await stream.allReady;
	const html = await new Response(stream).text();

	expect(load).toHaveBeenCalledTimes(1);
	expect(html).toContain('data-inth-deferred');
	expect(html).toContain('>Accept</button>');
	expect(html).toContain(DEFER_CAPTURE_SCRIPT);
});
