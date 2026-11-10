import { describe, expect, it } from 'vitest';

import { readIntent } from './read-intent';

describe('readIntent', () => {
	it('reads the three intents the package sends', () => {
		expect(readIntent('{"action":"all"}')).toEqual({ action: 'all' });
		expect(readIntent('{"action":"necessary"}')).toEqual({
			action: 'necessary',
		});
		expect(
			readIntent('{"action":"explicit","consents":{"measurement":true}}')
		).toEqual({ action: 'explicit', consents: { measurement: true } });
	});

	it('refuses what the native decoders refuse, instead of widening it', () => {
		for (const raw of [
			'{"action":"all","categories":["measurement"]}',
			'{"action":"necessary","categories":["measurement"]}',
			'{"action":"explicit","consents":{"measurement":true},"categories":["measurement"]}',
			'{"action":"all","consents":{"marketing":false}}',
			'{"action":"explicit"}',
			'{"action":"maybe"}',
			'not json',
		]) {
			expect(readIntent(raw), raw).toBeNull();
		}
	});
});
