import { describe, expect, it } from 'vitest';

import { C15tPluginError } from '../errors';
import {
	NATIVE_UI_PROPERTY,
	applyNativeUIGradleProperties,
	applyNativeUIPodfileProperties,
	resolveNativeUI,
} from '../native-ui';
import { applyToFixture } from './helpers';

const BACKEND = 'https://acme.inth.app';

describe('nativeUI prop', () => {
	it('defaults to the stock screens and leaves both build files clean', () => {
		expect(resolveNativeUI(undefined, undefined)).toBe(true);
		expect(
			applyNativeUIPodfileProperties(
				{ 'c15t.nativeUI': 'false', 'expo.jsEngine': 'hermes' },
				true
			)
		).toStrictEqual({ 'expo.jsEngine': 'hermes' });
		expect(
			applyNativeUIGradleProperties(
				[
					{ key: NATIVE_UI_PROPERTY, type: 'property', value: 'false' },
					{ key: 'hermesEnabled', type: 'property', value: 'true' },
				],
				true
			)
		).toStrictEqual([
			{ key: 'hermesEnabled', type: 'property', value: 'true' },
		]);
	});

	it('writes c15t.nativeUI=false for the pod and the Gradle build', () => {
		expect(resolveNativeUI(false, undefined)).toBe(false);
		expect(applyNativeUIPodfileProperties({}, false)).toStrictEqual({
			'c15t.nativeUI': 'false',
		});
		expect(
			applyNativeUIGradleProperties(
				[{ key: NATIVE_UI_PROPERTY, type: 'property', value: 'true' }],
				false
			)
		).toStrictEqual([
			{ key: NATIVE_UI_PROPERTY, type: 'property', value: 'false' },
		]);
	});

	it.each([
		['a string', 'false', /nativeUI must be true or false/u],
		[
			'a theme for screens the build leaves out',
			false,
			/theme would style nothing/u,
		],
	])('refuses %s at prebuild', (_label, nativeUI, message) => {
		const props = {
			backendURL: BACKEND,
			nativeUI,
			theme: { colors: { primary: '#2563EB' } },
		};
		expect(() => applyToFixture(props as never)).toThrowError(message);
		expect(() => resolveNativeUI(nativeUI, props.theme)).toThrowError(
			C15tPluginError
		);
	});
});
