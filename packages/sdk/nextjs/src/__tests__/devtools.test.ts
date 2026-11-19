import {
	InthDevTools as ReactInthDevTools,
	ConsentDevTools as ReactConsentDevTools,
	DevTools as ReactDevTools,
	inthDevtools as reactInthDevtools,
} from '@inth/react/devtools';
import { describe, expect, test } from 'vitest';

import {
	InthDevTools,
	ConsentDevTools,
	inthDevtools,
	DevTools,
} from '../devtools';

describe('@inth/nextjs/v3/devtools', () => {
	test('re-exports the React v3 adapter without wrapping it', () => {
		expect(ConsentDevTools).toBe(ReactConsentDevTools);
		expect(DevTools).toBe(ReactDevTools);
		expect(InthDevTools).toBe(ReactInthDevTools);
		expect(inthDevtools).toBe(reactInthDevtools);
	});
});
