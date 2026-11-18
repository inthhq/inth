import { inject } from 'vue';

import { symbolActiveUI } from '../utils/symbols';

export const useConsentActiveUI = function useConsentActiveUI() {
	const activeUI = inject(symbolActiveUI);
	if (!activeUI) {
		throw new Error('[inth] Active UI not found');
	}
	return activeUI;
};
