import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
	emitNativeEvent,
	nativeListenerCount,
	resetNativeStub,
	setNativeModule,
} from '../../__tests__/helpers/react-native-stub';
import { NATIVE_C15T_MODULE_NAME } from '../../protocol';
import {
	closeConsentPresenter,
	onConsentPresenterOutcome,
	parseConsentPresenterOutcome,
	presentConsentPrompt,
	presentPreferences,
} from '../presenter';

const native = {
	addListener: vi.fn(),
	closeConsentPresenter: vi.fn(),
	commit: vi.fn(),
	getBootstrap: vi.fn(),
	getSnapshot: vi.fn(),
	presentConsentPrompt: vi.fn(),
	presentPreferences: vi.fn(),
	removeListeners: vi.fn(),
};

describe('shared native presenter boundary', () => {
	beforeEach(() => {
		resetNativeStub();
		setNativeModule(NATIVE_C15T_MODULE_NAME, native);
	});

	test('forwards commands and preserves session identity', async () => {
		native.presentPreferences.mockResolvedValue(
			JSON.stringify({ sessionId: 'one', status: 'already-presented' })
		);
		expect(await presentPreferences('https://app.test/privacy')).toEqual({
			sessionId: 'one',
			status: 'already-presented',
		});
		expect(native.presentPreferences).toHaveBeenCalledWith(
			'https://app.test/privacy'
		);
		native.presentConsentPrompt.mockResolvedValue(
			'{"sessionId":null,"status":"not-required"}'
		);
		expect(await presentConsentPrompt('https://app.test/privacy')).toEqual({
			sessionId: null,
			status: 'not-required',
		});
		await closeConsentPresenter('obsolete');
		expect(native.closeConsentPresenter).toHaveBeenCalledWith('obsolete');
	});

	test('receives compact final outcomes and removes the native listener', () => {
		const receive = vi.fn();
		const stop = onConsentPresenterOutcome(receive);
		expect(nativeListenerCount('onConsentPresenterOutcome')).toBe(1);
		emitNativeEvent(
			'onConsentPresenterOutcome',
			'{"sessionId":"one","kind":"committed","revision":9}'
		);
		expect(receive).toHaveBeenCalledExactlyOnceWith({
			kind: 'committed',
			revision: 9,
			sessionId: 'one',
		});
		stop();
		expect(nativeListenerCount('onConsentPresenterOutcome')).toBe(0);
	});

	test.each([
		'{}',
		'{"sessionId":"x","kind":"toggle","revision":1}',
		'{"sessionId":"x","kind":"committed","revision":-1}',
	])('refuses invalid native outcome %s', (payload) => {
		expect(() => parseConsentPresenterOutcome(payload)).toThrow();
	});
});
