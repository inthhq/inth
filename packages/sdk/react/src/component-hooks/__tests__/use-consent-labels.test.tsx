import { describe, expect, test } from 'vitest';
import { renderHook } from 'vitest-browser-react';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import type { ComponentFixtureOptions as InthProviderOptions } from '~/__tests__/component-fixture-provider';

import { testing } from '../../testing';
import { useConsentLabels } from '../use-consent-labels';

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

describe('useConsentLabels', () => {
	test('labels every action and preference control in English by default', async () => {
		const { result } = await renderHook(() => useConsentLabels(), {
			wrapper: createWrapper(),
		});

		expect(result.current).toEqual({
			actions: {
				accept: 'Accept All',
				customize: 'Customize',
				dismiss: 'OK',
				reject: 'Reject All',
				save: 'Save Settings',
			},
			preferenceControls: {
				'opt-out': 'Do not sell or share my data',
				preferences: 'Manage preferences',
			},
		});
	});

	test('follows the active language', async () => {
		const { result } = await renderHook(() => useConsentLabels(), {
			wrapper: createWrapper({
				i18n: {
					detectBrowserLanguage: false,
					locale: 'de',
					messages: {
						de: {
							common: { acceptAll: 'Alle annehmen', acknowledge: 'Verstanden' },
							rights: { preferences: 'Einstellungen verwalten' },
						},
					},
				},
			}),
		});

		expect(result.current.actions.accept).toBe('Alle annehmen');
		expect(result.current.actions.dismiss).toBe('Verstanden');
		expect(result.current.preferenceControls.preferences).toBe(
			'Einstellungen verwalten'
		);
	});
});
