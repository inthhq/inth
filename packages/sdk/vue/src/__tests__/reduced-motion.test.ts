/**
 * Unset, `disableAnimation` follows the visitor's reduced motion setting,
 * as it does in the other adapters.
 *
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { afterAll, expect, test, vi } from 'vite-plus/test';
import { defineComponent, nextTick } from 'vue';
import type { ComputedRef } from 'vue';

import {
	consentConfigKey,
	useConsentConfig,
} from '../runtime/composables/config';
import type { ConsentConfig } from '../runtime/config';

const listeners = new Set<(event: { matches: boolean }) => void>();
let reduced = true;
vi.stubGlobal(
	'matchMedia',
	vi.fn((query: string) => ({
		addEventListener: (_type: string, listener: () => void) =>
			listeners.add(listener),
		get matches() {
			return query === '(prefers-reduced-motion: reduce)' && reduced;
		},
		removeEventListener: (_type: string, listener: () => void) =>
			listeners.delete(listener),
	}))
);
afterAll(() => {
	vi.unstubAllGlobals();
});

const readConfig = (config: Partial<ConsentConfig>) => {
	let read: ComputedRef<ConsentConfig> | undefined;
	mount(
		defineComponent({
			render: () => null,
			setup() {
				read = useConsentConfig();
			},
		}),
		{ global: { provide: { [consentConfigKey as symbol]: config } } }
	);
	return read as ComputedRef<ConsentConfig>;
};

test('reduced motion turns animation off unless the host set it', async () => {
	const unset = readConfig({});
	const explicit = readConfig({ disableAnimation: false });
	await nextTick();
	expect(unset.value.disableAnimation).toBe(true);
	expect(explicit.value.disableAnimation).toBe(false);

	reduced = false;
	for (const listener of listeners) {
		listener({ matches: false });
	}
	expect(unset.value.disableAnimation).toBe(false);
});
