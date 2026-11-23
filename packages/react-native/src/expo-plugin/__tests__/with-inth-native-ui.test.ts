import { describe, expect, it } from 'vitest';

import { InthPluginError } from '../inth-plugin-error';
import {
	NATIVE_UI_PROPERTY,
	applyNativeUIGradleProperties,
	applyNativeUIPodfileProperties,
	resolveNativeUI,
} from '../with-inth-native-ui';
import { applyToFixture } from './helpers';

const BACKEND = 'https://acme.inth.app';

describe('nativeUI prop', () => {
	it('defaults to the stock screens and leaves both build files clean', () => {
		expect(resolveNativeUI(undefined, undefined)).toBe(true);
		expect(
			applyNativeUIPodfileProperties(
				{ 'expo.jsEngine': 'hermes', 'inth.nativeUI': 'false' },
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

	it('writes inth.nativeUI=false for the pod and the Gradle build', () => {
		expect(resolveNativeUI(false, undefined)).toBe(false);
		expect(applyNativeUIPodfileProperties({}, false)).toStrictEqual({
			'inth.nativeUI': 'false',
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
			nativeUI,
			projectUrl: BACKEND,
			theme: { colors: { primary: '#2563EB' } },
		};
		expect(() => applyToFixture(props as never)).toThrowError(message);
		expect(() => resolveNativeUI(nativeUI, props.theme)).toThrowError(
			InthPluginError
		);
	});
});
