import { defineComponent, h } from 'vue';

import { useOptInConfirmationHost } from '../composables/use-consent-kernel';
import { LazyOptInConfirmation } from './lazy-opt-in-confirmation';

/**
 * Hosts the opt-in confirmation for `InthProvider` when no banner or
 * dialog on the page does, such as for a returning visitor who opts in
 * from a widget or a consent gate. It claims the host while mounted.
 *
 * @internal
 */
export const OptInConfirmationHost = defineComponent({
	name: 'OptInConfirmationHost',
	setup() {
		const active = useOptInConfirmationHost();
		return function render() {
			return active.value ? h(LazyOptInConfirmation) : null;
		};
	},
});
