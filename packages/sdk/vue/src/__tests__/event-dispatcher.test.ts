import type { Script } from '@inth/sdk/engine';
import { createConsentRuntime } from '@inth/sdk/runtime';
import { resolvePolicyRules } from '@inth/sdk/schema/types';
import { mount } from '@vue/test-utils';
import { expect, test, vi } from 'vite-plus/test';
import { defineComponent, h } from 'vue';

import { inth } from '../index';
import type { EventDispatcher } from '../runtime/composables';
import { useEventDispatcher } from '../runtime/composables';
import { testing } from '../testing';

const posthog: Script = {
	callbackOnly: true,
	category: 'measurement',
	id: 'posthog',
	vendor: 'posthog',
};

test('useEventDispatcher follows the runtime scripts, live consent and one pageview history', async () => {
	const runtime = createConsentRuntime({
		mode: testing(),
		prefetch: {
			initialPolicyResolution: resolvePolicyRules({
				countryCode: null,
				regionCode: null,
				rules: [
					{
						categories: ['measurement'],
						id: 'events',
						match: { fallback: true },
						model: 'opt-in',
						prompt: 'choice',
					},
				],
			}),
		},
		scripts: [posthog],
	});
	const capture = vi.fn();
	const globals = { posthog: { capture } };
	const dispatchers: EventDispatcher[] = [];
	const Probe = defineComponent({
		setup() {
			dispatchers.push(
				useEventDispatcher(() => ({ globals, pageviews: ['posthog'] }))
			);
			return () => h('div');
		},
	});
	const wrapper = mount(
		defineComponent({ setup: () => () => [h(Probe), h(Probe)] }),
		{
			global: { plugins: [[inth, { runtime }]] },
		}
	);
	const [first, second] = dispatchers;

	first?.pageview('/');
	await runtime.kernel.commands.save({ measurement: true });
	// Another component's dispatcher shares the history, so this is the first send.
	second?.pageview('/pricing');
	first?.pageview('/pricing');
	expect(capture.mock.calls).toEqual([['$pageview']]);

	await runtime.kernel.commands.save({ measurement: false });
	first?.track('add_to_cart');
	expect(capture).toHaveBeenCalledTimes(1);
	wrapper.unmount();
});
