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
		// Both native decoders accept an empty map, as a save that changed nothing.
		expect(readIntent('{"action":"explicit","consents":{}}')).toEqual({
			action: 'explicit',
			consents: {},
		});
	});

	it('refuses what the native decoders refuse, instead of widening it', () => {
		for (const raw of [
			'{"action":"all","categories":["measurement"]}',
			'{"action":"necessary","categories":["measurement"]}',
			'{"action":"explicit","consents":{"measurement":true},"categories":["measurement"]}',
			'{"action":"all","consents":{"marketing":false}}',
			'{"action":"explicit"}',
			'{"action":"explicit","consents":[]}',
			'{"action":"explicit","consents":null}',
			'{"action":"explicit","consents":{"ads":true}}',
			'{"action":"explicit","consents":{"necessary":true}}',
			'{"action":"explicit","consents":{"measurement":"yes"}}',
			'{"action":"explicit","consents":{"marketing":1}}',
			'{"action":"maybe"}',
			'not json',
		]) {
			expect(readIntent(raw), raw).toBeNull();
		}
	});
});
