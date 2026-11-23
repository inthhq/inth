/** One-tag IAB install. Load instead of inth.js. */
import { createIAB, initializeIABStub, destroyIABStub } from '@inth/sdk-iab';
import { publishDevToolsLauncher } from '@inth/sdk-ui/utils/devtools-launcher';

import { autoInit, createGlobal, installGlobal } from '../global';
import { mountIABConsentUI } from '../iab/mount-iab-consent-ui';

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
	throw new Error('Load inth.iab.js instead of inth.js or inth.headless.js.');
}
autoInit(api);
