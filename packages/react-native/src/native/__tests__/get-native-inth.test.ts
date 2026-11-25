/**
 * The bridge lookup: a usable module when the binary has one, and a diagnosis
 * that names the cause when it does not.
 *
 * `react-native` resolves to the faithful stub in this package's Vitest config,
 * so the production lookup path is what runs here.
 */

import { beforeEach, describe, expect, test } from 'vite-plus/test';

import {
	buildSnapshot,
	captureErrorMessage,
	flush,
} from '../../__tests__/helpers/fake-native';
import {
	emitNativeEvent,
	nativeListenerCount,
	resetNativeStub,
	setNativeModule,
	setRegistryThrows,
} from '../../__tests__/helpers/react-native-stub';
import { NATIVE_INTH_MODULE_NAME } from '../../protocol';
import {
	getNativeInth,
	getNativeInthEvents,
	hasNativeInthSurface,
	NativeInthUnavailableError,
} from '../get-native-inth';

describe('getNativeInth', () => {
	beforeEach(() => {
		resetNativeStub();
	});

	test('returns the registered module', () => {
		const fake = { getBootstrap: () => '', getSnapshot: () => '' };

		setNativeModule(NATIVE_INTH_MODULE_NAME, fake);

		expect(getNativeInth()).toBe(fake);
	});

	test('names the causes when no module is registered', () => {
		const message = captureErrorMessage(getNativeInth);

		expect(captureErrorMessage(getNativeInth)).toContain('"Inth"');
		expect(message).toContain('Expo Go');
		expect(message).toContain('pod install');
		expect(message).toContain('JavaScript-only update');
	});

	test('throws its own error type for a missing module', () => {
		expect(() => getNativeInth()).toThrow(NativeInthUnavailableError);
	});

	test('wraps a registry that invariants rather than returning null', () => {
		// A build with the New Architecture off fails the lookup this way, so
		// the diagnosis still has to come from this package.
		setRegistryThrows(true);

		expect(captureErrorMessage(getNativeInth)).toContain(
			'the TurboModule registry refused the lookup'
		);
	});
});

describe('hasNativeInthSurface', () => {
	test('accepts a module with the synchronous reads', () => {
		expect(
			hasNativeInthSurface({
				commit: () => Promise.resolve(''),
				getBootstrap: () => '',
				getSnapshot: () => '',
			} as never)
		).toBe(true);
	});

	test('rejects a module built against another protocol', () => {
		expect(hasNativeInthSurface({ getBootstrap: () => '' } as never)).toBe(
			false
		);
	});
});

describe('getNativeInthEvents', () => {
	beforeEach(() => {
		resetNativeStub();
	});

	test('rejects a half-built native binding', () => {
		setNativeModule(NATIVE_INTH_MODULE_NAME, {
			getBootstrap: () => '',
			getSnapshot: () => '',
		});

		expect(captureErrorMessage(getNativeInthEvents)).toContain(
			'missing getBootstrap, getSnapshot, or commit'
		);
	});

	test('delivers every event payload as JSON text', () => {
		setNativeModule(NATIVE_INTH_MODULE_NAME, {
			commit: () => Promise.resolve(''),
			getBootstrap: () => '',
			getSnapshot: () => JSON.stringify(buildSnapshot()),
		});

		const events = getNativeInthEvents();
		const received: string[] = [];

		const subscription = events.addListener('snapshot', (payload) => {
			received.push(payload);
		});

		expect(nativeListenerCount('snapshot')).toBe(1);

		// iOS sends the JSON string the contract specifies; an Android core may
		// hand over a dictionary instead. Both have to arrive as text.
		flush(() => {
			emitNativeEvent('snapshot', '{"revision":3}');
			emitNativeEvent('snapshot', { revision: 4 });
			emitNativeEvent('snapshot', undefined);
		});

		subscription.remove();

		expect(nativeListenerCount('snapshot')).toBe(0);
		expect(received).toEqual(['{"revision":3}', '{"revision":4}', '{}']);
	});
});
