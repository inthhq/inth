/**
 * The React 18 path of a streamed surface: without `use()`, the boundary
 * suspends on the thrown promise and reads the runtime's recorded result
 * on its retry.
 */
import {
	createConsentProviderRuntime,
	defaultRuntimeModules,
	streamPrefetch,
} from '@inth/sdk/runtime';
import { expect, test } from 'vitest';

import { transportMode } from '../../../__tests__/fixtures/transport-mode';
import { readRecorded } from '../streamed-surface';

test('throws the pending promise, then returns the recorded result', async () => {
	const stream = Promise.withResolvers<{ now: number }>();
	const runtime = createConsentProviderRuntime(
		{ mode: transportMode({}), persistence: false, prefetch: stream.promise },
		{ ...defaultRuntimeModules, streamPrefetch }
	);
	const settled = runtime.streamed?.settled;
	if (!settled) {
		throw new Error('expected a streamed prefetch');
	}

	let thrown: unknown;
	try {
		readRecorded(settled);
	} catch (error) {
		thrown = error;
	}
	expect(thrown).toBe(settled);

	stream.resolve({ now: 1 });
	await settled;
	expect(readRecorded(settled)).toEqual({ now: 1 });
	runtime.dispose();
});

test('a rejected stream reads as undefined on the retry', async () => {
	const rejected = Promise.reject(new Error('backend down'));
	rejected.catch(() => undefined);
	const runtime = createConsentProviderRuntime(
		{ mode: transportMode({}), persistence: false, prefetch: rejected },
		{ ...defaultRuntimeModules, streamPrefetch }
	);
	const settled = runtime.streamed?.settled;
	if (!settled) {
		throw new Error('expected a streamed prefetch');
	}
	await settled;
	expect(readRecorded(settled)).toBeUndefined();
	runtime.dispose();
});
