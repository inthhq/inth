/**
 * `dist/c15t.testing.js`, the script tag for tests: the stock UI with a
 * policy resolved in the browser and no backend.
 *
 * The production files (`c15t.js`, `c15t.hosted.js` and the others) never
 * contain this transport or the policy pack. Load this file only in a
 * test page. Its policy comes from `data-policy` (preset names such as
 * `europeOptIn`), `inth.init({ policy })`, `inth.init({ mode:
 * inth.testing({ policy }) })`, or the recommended pack, picked by the
 * tag's `data-country` and `data-region`.
 */

import { publishDevToolsLauncher } from '@inth/sdk-ui/utils/devtools-launcher';

import { autoInit, installGlobal } from '../global-base';
import { createTestingGlobal } from '../testing-global';
import { mountConsentUI } from '../ui/mount';

const api = installGlobal(
	createTestingGlobal({ mountUI: mountConsentUI, publishDevToolsLauncher })
);
autoInit(api);
