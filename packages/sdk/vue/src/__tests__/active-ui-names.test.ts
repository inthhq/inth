import { describe, expect, test, vi } from 'vite-plus/test';

import type { ConsentConfig } from '../runtime/config';
import {
	toKernelActiveUI,
	toVueActiveUI,
} from '../runtime/display-data.model';
import { createVueConsentKernelContext } from './test-kernel';

describe('activeUI names', () => {
	test('Vue calls the dialog `dialog`, as the kernel and React do', () => {
		expect(toVueActiveUI('dialog')).toBe('dialog');
		expect(toKernelActiveUI('dialog')).toBe('dialog');
		expect(toVueActiveUI('banner')).toBe('banner');
		expect(toKernelActiveUI('banner')).toBe('banner');
	});

	test('`null` stays the Vue name for no surface', () => {
		expect(toVueActiveUI('none')).toBeNull();
		expect(toKernelActiveUI(null)).toBe('none');
	});

	test("setting activeUI to 'dialog' opens the kernel's dialog", () => {
		const context = createVueConsentKernelContext({
			config: {
				consentCategories: ['necessary', 'measurement', 'marketing'],
				customFetch: vi.fn(
					() => new Response('{}')
				) as unknown as typeof fetch,
				projectUrl: 'https://consent.example',
			} as ConsentConfig,
		});
		try {
			context.activeUI.value = 'dialog';
			expect(context.kernel.getSnapshot().activeUI).toBe('dialog');
			expect(context.activeUI.value).toBe('dialog');
		} finally {
			context.dispose();
		}
	});
});
