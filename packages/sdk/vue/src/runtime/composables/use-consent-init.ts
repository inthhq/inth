import { inject } from 'vue';

import { symbolInit } from '../utils/consent-symbols.model';

export const useConsentInit = function useConsentInit() {
	const init = inject(symbolInit);
	if (!init) {
		throw new Error('[inth] Init not found');
	}
	return init;
};
