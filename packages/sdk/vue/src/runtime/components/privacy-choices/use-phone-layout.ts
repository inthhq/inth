import { PHONE_LAYOUT_QUERY } from '@inth/sdk/engine';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { Ref } from 'vue';

/**
 * Whether the phone layout applies. The server renders desktop, and so
 * does hydration; the browser switches once mounted, keeping every node
 * (ARCH-01).
 *
 * @internal
 */
export const usePhoneLayout = function usePhoneLayout(): Ref<boolean> {
	const phone = ref(false);
	let stop: (() => void) | undefined;
	onMounted(() => {
		if (typeof window.matchMedia !== 'function') {
			return;
		}
		const query = window.matchMedia(PHONE_LAYOUT_QUERY);
		const update = () => {
			phone.value = query.matches;
		};
		update();
		query.addEventListener('change', update);
		stop = () => query.removeEventListener('change', update);
	});
	onBeforeUnmount(() => stop?.());
	return phone;
};
