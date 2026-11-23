import { inject } from 'vue';

import { symbolInit } from '../utils/symbols';

export const useConsentInit = function useConsentInit() {
	const init = inject(symbolInit);
	if (!init) {
		throw new Error('[inth] Init not found');
	}
	return init;
};
