import { describe, expect, test } from 'vite-plus/test';
import { renderHook } from 'vitest-browser-react';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import type { ComponentFixtureOptions as InthProviderOptions } from '~/__tests__/component-fixture-provider';

import { testing } from '../../testing';
import { useConsentTextDirection } from '../use-consent-text-direction';

const createWrapper = function createWrapper(
	options: Partial<InthProviderOptions> = {}
) {
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return (
			<InthProvider
				options={{
					mode: testing(),
					persistence: false,
					...options,
				}}
			>
				{children}
			</InthProvider>
		);
	};
};

describe('useConsentTextDirection', () => {
	test('is left-to-right for the default language', async () => {
		const { result } = await renderHook(() => useConsentTextDirection(), {
			wrapper: createWrapper(),
		});

		expect(result.current).toBe('ltr');
	});

	test('is right-to-left when the copy is in Hebrew', async () => {
		const { result } = await renderHook(() => useConsentTextDirection(), {
			wrapper: createWrapper({
				i18n: {
					detectBrowserLanguage: false,
					locale: 'he',
					messages: { he: { common: { acceptAll: 'קבל הכל' } } },
				},
			}),
		});

		expect(result.current).toBe('rtl');
	});
});
