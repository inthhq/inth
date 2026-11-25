/**
 * `offline()` from the plugin entry resolves the policy in the browser with
 * no backend. Its init names the location it resolved for, as `/v1/consent/init` does,
 * so the dialog, which waits for the init's display data, has its copy.
 */
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { inth } from '../index';
import ConsentDialog from '../runtime/components/dialog/manager.vue';
import { useConsentKernelContext } from '../runtime/composables';
import { testing } from '../testing';

afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

test('offline() gives the dialog its English title without a request', async () => {
	const fetch = vi.fn<typeof globalThis.fetch>();
	vi.stubGlobal('fetch', fetch);
	let context!: ReturnType<typeof useConsentKernelContext>;
	const wrapper = mount(
		{
			components: { ConsentDialog },
			setup() {
				context = useConsentKernelContext();
			},
			template: '<ConsentDialog />',
		},
		{
			attachTo: document.body,
			global: {
				plugins: [
					[
						inth,
						{
							disableAnimation: true,
							mode: testing(),
						},
					],
				],
			},
		}
	);
	try {
		await context.kernel.commands.init();
		await flushPromises();
		context.activeUI.value = 'dialog';
		await vi.waitFor(() => {
			expect(
				document.querySelector('[data-testid="consent-dialog-title"]')
					?.textContent
			).toBe('Privacy settings');
		});
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		wrapper.unmount();
	}
});
