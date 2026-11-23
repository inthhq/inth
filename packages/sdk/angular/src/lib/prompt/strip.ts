/**
 * The consent prompt as a Banner. Only this module names the `banner`
 * stylesheet, so a page that shows another container never downloads it.
 * The file is named `strip`, not `banner`: it loads on demand, its chunk
 * is named after it, and content blockers drop files named like a consent
 * banner.
 *
 * @packageDocumentation
 */

import styles from '@inth/sdk/ui/styles/components/consent-banner';
import * as bannerSheet from '@inth/sdk/ui/styles/sheets/banner-deferred';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as surface from '@inth/sdk/ui/styles/sheets/surface-deferred';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

import type { ContainerModule } from './containers';

/** Tokens, buttons, the shell, then the Banner rules, in cascade order. */
export const BANNER_CONTAINER: ContainerModule = {
	sheets: [tokens, button, surface, bannerSheet],
	styles,
};
