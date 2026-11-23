/**
 * The `TransferState` key the server's boot (`consent-boot.model.ts`)
 * travels under.
 *
 * @packageDocumentation
 * @internal
 */

import { makeStateKey } from '@angular/core';

import type { ConsentBoot } from './consent-boot.model';

/** The `TransferState` key of the boot. @internal */
export const BOOT_STATE_KEY = makeStateKey<ConsentBoot>('inth-boot');
