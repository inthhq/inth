// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
import { claimOptOutConfirmationHost } from '@inth/sdk/surface-actions';
import { defineComponent, h, onBeforeUnmount, onMounted } from 'vue';

import { useConsentKernel } from '../composables/use-consent-kernel';
import type OptOutConfirmationComponent from './opt-out-confirmation.vue';
import { defineChunkComponent } from './parts/define-chunk-component';
import { importComponent } from './parts/import-component';

const OptOutConfirmationView = defineChunkComponent(
	'OptOutConfirmationView',
	() => importComponent(() => import('./opt-out-confirmation.vue'))
);
/**
 * The standalone opt-out confirmation. It claims the host as soon as it
 * mounts, before its chunk arrives, so the dialog never opens on its
 * receipt in its place meanwhile.
 */
export const LazyOptOutConfirmation = defineComponent({
	inheritAttrs: false,
	name: 'OptOutConfirmation',
	setup(_props, { attrs, slots }) {
		const kernel = useConsentKernel();
		let release: (() => void) | undefined;
		onMounted(() => {
			release = claimOptOutConfirmationHost(
				kernel,
				Symbol('OptOutConfirmation')
			);
		});
		onBeforeUnmount(() => release?.());
		return () => h(OptOutConfirmationView, { ...attrs, embedded: true }, slots);
	},
}) as unknown as typeof OptOutConfirmationComponent;
