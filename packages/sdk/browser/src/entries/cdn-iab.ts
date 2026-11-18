/** One-tag IAB install. Load instead of c15t.js. */
import { createIAB, initializeIABStub, destroyIABStub } from '@inth/sdk-iab';
import { publishDevToolsLauncher } from '@inth/sdk-ui/utils/devtools-launcher';

import { autoInit, createGlobal, installGlobal } from '../global';
import { mountIABConsentUI } from '../iab/mount';

const api = installGlobal(
	createGlobal({
		createIAB,
		mountUI: mountIABConsentUI,
		onStart: (options) => {
			if (options.iab !== false && options.iab?.enabled !== false) {
				initializeIABStub();
			}
			return destroyIABStub;
		},
		pkg: '@inth/sdk/iab-client',
		publishDevToolsLauncher,
	})
);
if (api.pkg !== '@inth/sdk/iab-client') {
	throw new Error('Load c15t.iab.js instead of c15t.js or c15t.headless.js.');
}
autoInit(api);
